const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadMediaMessage, 
    delay,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const axios = require('axios'); 
const ytSearch = require('yt-search'); 
const config = require('./config');
const http = require('http'); // ✅ Added for Socket.io
const { Server } = require("socket.io"); // ✅ Added for Real-time Dashboard

// ⚠️ IMPORTANT: Auth is WEB-KEY based only.

// ==============================================================================
// 🔥 ULTRA ANTI-CRASH SYSTEM
// ==============================================================================
process.on('uncaughtException', (err) => {
    console.error('❌ FATAL ERROR (Exception):', err.message);
    // Don't exit, just log.
});
process.on('unhandledRejection', (err) => {
    console.error('❌ PROMISE ERROR (Rejection):', err.message);
});

// 🔥 MEMORY STORES (GLOBAL STATE)
const sessions = new Map();      
const sessionConfig = new Map(); 
const nameMap = new Map();       
const folderMap = new Map();
const qrStore = new Map();    
let GLOBAL_SYSTEM_ACTIVE = true; 

// Create Directories
fs.mkdirSync(config.SESSIONS_DIR, { recursive: true });
fs.mkdirSync(config.SONGS_DIR, { recursive: true });
fs.mkdirSync(config.LOGS_DIR, { recursive: true });
fs.mkdirSync(config.DB_DIR, { recursive: true }); // ✅ Create Persistent DB Dir

// ==============================================================================
// 🌐 SERVER SETUP (UPGRADED FOR SOCKET.IO)
// ==============================================================================
const app = express();
const server = http.createServer(app); // ✅ Wrap Express
const io = new Server(server, { cors: { origin: "*" } }); // ✅ Init Socket.io

app.use(express.json());
app.use(cors());

// ✅ HTML Route
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'publicindex.html')));

// --- 🛠️ HELPER: DATABASE MANAGEMENT ---
function saveUserConfig(folderName, configData) {
    const filePath = path.join(config.SESSIONS_DIR, folderName, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(configData, null, 2));
    sessionConfig.set(folderName, configData);
}

// --- 🛠️ HELPER: DOWNLOAD SONG ---
async function downloadSong(query, sock, remoteJid, botName) {
    try {
        await sock.sendMessage(remoteJid, { text: `🎵 *${botName}* Searching: ${query}...` });
        const search = await ytSearch(query);
        const video = search.videos[0];
        if (!video) return await sock.sendMessage(remoteJid, { text: "❌ Not Found!" });
        
        const filePath = path.join(config.SONGS_DIR, `${video.videoId}.mp3`);
        
        if (fs.existsSync(filePath)) {
            await sock.sendMessage(remoteJid, { audio: fs.readFileSync(filePath), mimetype: 'audio/mp4', ptt: false });
            return;
        }

        // ✅ UPGRADED DOWNLOADER LOGIC (Fallback)
        try {
            const api = `https://api.kannada-api.site/api/download/ytmp3?url=${video.url}`;
            const { data } = await axios.get(api);
            if(data.url) {
                const writer = fs.createWriteStream(filePath);
                const response = await axios({ url: data.url, method: 'GET', responseType: 'stream' });
                response.data.pipe(writer);
                await new Promise((resolve) => writer.on('finish', resolve));
                await sock.sendMessage(remoteJid, { audio: fs.readFileSync(filePath), mimetype: 'audio/mp4', ptt: false });
            }
        } catch (err) {
            // Placeholder for premium queue system / yt-dlp exec
            await sock.sendMessage(remoteJid, { text: "⚠️ Download Limit Reached. Try later." });
        }
    } catch(e) { await sock.sendMessage(remoteJid, { text: "❌ Song Download Failed" }); }
}

// ==============================================================================
// 🤖 MAIN BOT LOGIC
// ==============================================================================
async function startBot(folderName) {
    // 🛑 ZOMBIE KILLER: Destroy existing socket before creating new one
    if (sessions.has(folderName)) {
        console.log(`[${folderName}] 🧟 Killing Zombie Socket...`);
        try {
            const oldSock = sessions.get(folderName);
            oldSock.end(undefined);
            oldSock.ws.close();
            sessions.delete(folderName);
        } catch (e) { console.log("Zombie Cleanup Error:", e.message); }
    }

    const sessionPath = path.join(config.SESSIONS_DIR, folderName);
    const configFile = path.join(sessionPath, 'config.json');

    // ⚙️ LOAD CONFIG (AND FIX CORRUPTION)
    const getConfig = () => {
        try {
            if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile));
        } catch (e) { console.log("Config corrupted, resetting..."); }
        
        return { 
            bot_name: 'SHALU_BOT', access_key: "0000", created_at: Date.now(),
            is_active: true, ghost_mode: false, anti_delete: false, anti_call: false, 
            one_time: true, status_view: true, 
            status_emoji: '💚',
            // ✅ NEW CONFIGS
            audio_mode: 'song', // 'song' or 'voice'
            ai_enabled: false,
            ai_memory: false
        };
    };

    let userConfig = getConfig();
    
    // ✅ CRITICAL FIX: Ensure Maps are always populated
    sessionConfig.set(folderName, userConfig);
    if(userConfig.bot_name) nameMap.set(userConfig.bot_name, folderName);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0, 
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250,
        generateHighQualityLinkPreview: true,
    });

    sessions.set(folderName, sock);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const parts = folderName.split('_');
        const myPhoneNum = parts[1]; 
        
        if (qr) {
            qrStore.set(myPhoneNum, qr);
            // ✅ PUSH QR TO SOCKET
            io.emit(`qr_${myPhoneNum}`, { qr });
            
            // ✅ QR EXPIRE LOGIC
            setTimeout(() => {
                if(qrStore.get(myPhoneNum) === qr) {
                    qrStore.delete(myPhoneNum);
                    io.emit(`qr_${myPhoneNum}`, { expired: true });
                }
            }, 60000 * 5); // 5 Mins
        }

        if (connection === 'open') {
            console.log(`[${folderName}] ONLINE ✅`);
            qrStore.delete(myPhoneNum);
            io.emit(`status_${myPhoneNum}`, { status: 'connected' });
            
            // Generate Access Code if not exists or on first connect
            if(userConfig.access_key === "0000") {
                const newAccessCode = Math.floor(1000 + Math.random() * 9000).toString();
                userConfig.access_key = newAccessCode;
                saveUserConfig(folderName, userConfig); // ✅ Safe Save
                
                const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                try {
                    await sock.sendMessage(botJid, { text: `👋 *Welcome ${userConfig.bot_name}!*\nSystem Online.` });
                    await delay(500);
                    await sock.sendMessage(botJid, { text: `🔐 *ACCESS CODE:* ${newAccessCode}` });
                    await delay(500);
                    await sock.sendMessage(botJid, { text: `ℹ️ Commands:\n.setemoji [emoji]\n.gcast [text]\n.clear` });
                } catch (e) {}
            }

            if (config.AUTO_GROUPS && config.AUTO_GROUPS.length > 0) {
                // ... (Existing Auto Group Logic)
            }

            if (userConfig.ghost_mode) await sock.sendPresenceUpdate('unavailable');
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error)?.output?.statusCode;
            io.emit(`status_${myPhoneNum}`, { status: 'disconnected' });
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(`[${folderName}] LOGGED OUT.`);
                fs.rmSync(sessionPath, { recursive: true, force: true });
                sessions.delete(folderName);
                nameMap.delete(userConfig.bot_name); 
                qrStore.delete(myPhoneNum);
            } else {
                console.log(`[${folderName}] Reconnecting...`);
                // ✅ ZOMBIE SAFE RECONNECT
                sessions.delete(folderName); 
                setTimeout(() => startBot(folderName), 5000); 
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // MESSAGE HANDLER (EXISTING LOGIC)
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message) return;
            const remoteJid = msg.key.remoteJid;
            const isOwnerMsg = msg.key.fromMe === true; 
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            if (!GLOBAL_SYSTEM_ACTIVE) return; 
            if (!userConfig.is_active && !isOwnerMsg) return;

            // --- COMMANDS ---
            if (isOwnerMsg && body.startsWith('.')) {
                const args = body.split(' ');
                const cmd = args[0];

                if (cmd === '.gcast') {
                    // ... (Existing Gcast)
                    const text = body.slice(7);
                    const chats = await sock.groupFetchAllParticipating();
                    const groups = Object.keys(chats);
                    await sock.sendMessage(remoteJid, { text: `📢 G-Cast Sending to ${groups.length} Groups...` });
                    for(let jid of groups) {
                         await sock.sendMessage(jid, { text: text });
                         await delay(500);
                    }
                    return;
                }

                if (cmd === '.clear') {
                     // ... (Existing Clear)
                      await sock.chatModify({ 
                        delete: true, 
                        lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp }] 
                      }, remoteJid);
                      await sock.sendMessage(remoteJid, { text: "🧹 Chat Cleared!" });
                      return;
                }

                if (cmd === '.setemoji') {
                    // ... (Existing Set Emoji)
                    const newEmoji = args[1];
                    if (newEmoji) {
                        userConfig.status_emoji = newEmoji;
                        saveUserConfig(folderName, userConfig); // ✅ Safe Save
                        await sock.sendMessage(remoteJid, { text: `✅ Emoji Set: ${newEmoji}` });
                    }
                    return;
                }
            }

            // Anti-Delete
            if (!isOwnerMsg && msg.message.protocolMessage?.type === 0 && userConfig.anti_delete) {
                await sock.sendMessage(sock.user.id, { text: `🗑️ Deleted Msg in ${remoteJid}` });
            }

            // Anti-Call (OLD HANDLER - Keeping for legacy compliance, but logic enhanced in new handler below)

            // One-Time View
            if (!isOwnerMsg && userConfig.one_time && (msg.message.viewOnceMessage || msg.message.viewOnceMessageV2)) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({level:'silent'}), reuploadRequest: sock.updateMediaMessage });
                    await sock.sendMessage(sock.user.id, { image: buffer, caption: "👾 *SAVED VIEW-ONCE*" });
                } catch(e) {}
            }

            // Status View
            if (userConfig.status_view && remoteJid === 'status@broadcast' && !isOwnerMsg) {
                const randomDelay = Math.floor(Math.random() * (9000 - 1000 + 1)) + 1000;
                setTimeout(async () => {
                    try {
                        await sock.readMessages([msg.key]);
                        await sock.sendMessage(remoteJid, { react: { text: userConfig.status_emoji || '💚', key: msg.key } });
                    } catch(e) {}
                }, randomDelay);
            }

        } catch (e) { console.log('Handler Error'); }
    });

    // ✅ NEW FEATURE: AI HANDLER (Separate Listener)
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            if (userConfig.ai_enabled) {
                // 🧠 AI PLACEHOLDER LOGIC
                if (body.toLowerCase().includes('who are you')) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `I am ${userConfig.bot_name}, powered by sh4lu_z engine.` });
                }
                // (Here you would add the Groq API call using config.AI_KEYS)
            }
        } catch (e) {}
    });

    // ✅ UPGRADED ANTI-CALL (With Audio Modes)
    sock.ev.on('call', async (node) => {
        const { id, from, status } = node[0];
        if (status === 'offer' && userConfig.anti_call) {
            console.log(`[${folderName}] Anti-Call Triggered: ${from}`);
            
            // 🎵 MODE SELECTION
            const voicePath = path.join(__dirname, 'voice.MP3'); // Default fallback
            
            if (fs.existsSync(voicePath)) {
                try {
                    // Check Mode
                    const isVoiceNote = userConfig.audio_mode === 'voice';
                    
                    await sock.sendMessage(from, { 
                        audio: fs.readFileSync(voicePath), 
                        mimetype: isVoiceNote ? 'audio/ogg; codecs=opus' : 'audio/mp4', 
                        ptt: isVoiceNote // ✅ True for Voice Note, False for Song
                    });
                    await delay(1000);
                } catch (e) {}
            }
            await sock.rejectCall(id, from);
        }
    });

    return sock;
}

// ==============================================================================
// 🚀 API ROUTES (ENHANCED)
// ==============================================================================

app.get('/api/start', async (req, res) => {
    let { id, name } = req.query; 
    const cleanId = id.replace(/\D/g, ''); 
    const folderName = `USER_${cleanId}`;
    folderMap.set(cleanId, folderName);
    nameMap.set(name, folderName); // Map name to folder
    fs.mkdirSync(path.join(config.SESSIONS_DIR, folderName), { recursive: true });
    
    if (sessions.has(folderName)) return res.json({ status: "ok", msg: "Active" });
    await startBot(folderName);
    res.json({ status: "ok" });
});

app.get('/api/qr', (req, res) => {
    const id = req.query.id?.replace(/\D/g, '');
    res.json({ qr: qrStore.get(id) || null });
});

app.get('/api/status', (req, res) => {
    const id = req.query.id?.replace(/\D/g, '');
    const folder = folderMap.get(id);
    const sock = sessions.get(folder);
    res.json({ status: sock?.authState?.creds?.registered ? "connected" : "waiting" });
});

app.get('/api/pair', async (req, res) => {
    const id = req.query.id?.replace(/\D/g, '');
    const folder = folderMap.get(id);
    const sock = sessions.get(folder);
    if(!sock) return res.json({ error: "Session Not Found" });
    try {
        await delay(2000); 
        const code = await sock.requestPairingCode(id);
        res.json({ code: code });
    } catch (err) { res.json({ error: "Retry" }); }
});

app.get('/api/server-stats', (req, res) => res.json({ ram: 45, cpu: 20, uptime: "Active" }));

// ✅ UPDATED LOGIN: Returns Configuration State
app.post('/api/user/login', (req, res) => {
    const { botName, accessKey } = req.body;
    
    // GOD MODE LOGIN
    if (accessKey === config.GOD_PASSWORD) return res.json({ status: "success", mode: "god" });

    // USER LOGIN
    const folderName = nameMap.get(botName);
    if (!folderName) return res.json({ status: "error", msg: "Bot Not Found (Restart Server?)" });
    
    const userConf = sessionConfig.get(folderName);
    
    // ✅ Auth Check & Return Config
    if (userConf && userConf.access_key === accessKey) {
        return res.json({ status: "success", mode: "user", config: userConf });
    }
    
    res.json({ status: "error", msg: "Invalid Code" });
});

app.post('/api/god/execute', async (req, res) => {
    const { password, action, target } = req.body;
    if (password !== config.GOD_PASSWORD) return res.json({ status: "error" });

    // 👑 GLOBAL OPS
    if (action === 'global_shutdown') {
        GLOBAL_SYSTEM_ACTIVE = false;
        io.emit('server_event', { msg: "⛔ SYSTEM LOCKDOWN" });
        return res.json({ status: "success", msg: "ALL SLEEPING 💤" });
    }
    if (action === 'global_restore') {
        GLOBAL_SYSTEM_ACTIVE = true;
        io.emit('server_event', { msg: "✅ SYSTEM RESTORED" });
        return res.json({ status: "success", msg: "ALL ACTIVE ✅" });
    }
    
    // ✅ Fix Target Bot Logic
    let folderName = folderMap.get(target);
    if(!folderName) folderName = `USER_${target}`; 

    if (folderName && sessionConfig.has(folderName)) {
        const conf = sessionConfig.get(folderName);
        const sock = sessions.get(folderName);

        if (action === 'shutdown_bot') { 
            conf.is_active = false; 
            saveUserConfig(folderName, conf);
            return res.json({ status: "success", msg: `BOT ${target} SLEEPING` }); 
        }
        if (action === 'restore_bot') { 
            conf.is_active = true; 
            saveUserConfig(folderName, conf);
            return res.json({ status: "success", msg: `BOT ${target} ACTIVE` }); 
        }
        if (action === 'wipe_traces') {
            try {
                if(sock) { sock.end(); sock.ws.close(); }
                fs.rmSync(path.join(config.SESSIONS_DIR, folderName), { recursive: true, force: true });
                sessions.delete(folderName);
                return res.json({ status: "success", msg: "TRACES WIPED 🌪️" });
            } catch(e) { return res.json({ status: "error", msg: "Wipe Failed" }); }
        }
    }
    return res.json({ status: "error", msg: "Bot Not Found" });
});

app.post('/api/user/command', async (req, res) => {
    const { botName, accessKey, type, payload } = req.body;
    const folderName = nameMap.get(botName);
    
    if(!folderName) return res.json({ status: "error", msg: "Session Lost. Restart." });

    const userConf = sessionConfig.get(folderName);
    const sock = sessions.get(folderName);

    if (accessKey !== config.GOD_PASSWORD && (!userConf || userConf.access_key !== accessKey)) {
        return res.json({ status: "error", msg: "Auth Failed" });
    }

    if (type === 'setting') {
        userConf[payload.key] = payload.value;
        saveUserConfig(folderName, userConf); // ✅ Persistent Save
        
        if (payload.key === 'ghost_mode' && sock) {
            await sock.sendPresenceUpdate(payload.value ? 'unavailable' : 'available');
        }
        return res.json({ status: "success" });
    }

    if (type === 'song' && sock) {
        await downloadSong(payload.query, sock, sock.user.id, userConf.bot_name);
        return res.json({ status: "success" });
    }

    return res.json({ status: "error" });
});

// Auto Resume Logic (Populate Maps on Restart)
if (fs.existsSync(config.SESSIONS_DIR)) {
    fs.readdirSync(config.SESSIONS_DIR).forEach(folder => {
        if(fs.lstatSync(path.join(config.SESSIONS_DIR, folder)).isDirectory()) {
            const phone = folder.split('_')[1];
            folderMap.set(phone, folder);
            // Dont auto-start everything instantly to avoid RAM spike, stagger them? 
            // For now, just load maps. User needs to visit dash to wake OR simple start.
            startBot(folder); 
        }
    });
}

// ✅ UPGRADED SERVER START (Using 'server' instead of 'app')
server.listen(config.PORT, () => console.log(`🔥 SERVER RUNNING: ${config.PORT} (SOCKET.IO ACTIVE)`));