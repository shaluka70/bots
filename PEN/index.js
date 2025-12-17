const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config'); 

// --- SETUP ---
const tempDir = path.join(__dirname, 'temp_videos');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// History File
let history = [];
try {
    if (fs.existsSync('history.json')) {
        history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
    }
} catch (e) { history = []; }

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');

    const sock = makeWASocket({
        auth: state,
        // printQRInTerminal අයින් කළා
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu Server", "Chrome", "20.0.04"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Baileys Bot Connected!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const sender = msg.key.participant || from;
        
        const senderNum = sender.replace(/[^0-9]/g, '');

        if (!text) return;

        // ✅ SAFE ADMIN CHECK (ඔයාගේ ඉල්ලීම මත දැම්මා)
        const validAdmins = config.adminNumbers.map(num => num.replace(/[^0-9]/g, ''));
        const isAdmin = validAdmins.includes(senderNum);

        if (!isAdmin) return;

        const lowerText = text.toLowerCase();

        if (lowerText.includes('upload bg')) {
            await handleVideoBatch(sock, from, config.channels.bg, "Background Videos");
        }
        else if (lowerText.includes('upload fun')) {
            await handleVideoBatch(sock, from, config.channels.fun, "Fun Videos");
        }
    });
}

/// --- NEW POWERFUL PROCESSOR (Fixed Logic) ---
async function handleVideoBatch(sock, from, channelList, typeName) {
    await sock.sendMessage(from, { text: `📥 *${typeName}:* Searching via TikWM...` });

    let sentCount = 0;      // යැවූ වීඩියෝ ගණන
    let attempts = 0;       // උත්සාහ කළ වාර ගණන
    const maxAttempts = 20; // ආරක්ෂාවට: 20 පාරක් ට්‍රයි කරලත් බැරි නම් නවතින්න (Infinite Loop වලක්වන්න)

    // sentCount එක 5 වෙනකම් හෝ attempts 20 වෙනකම් loop එක දුවනවා
    while (sentCount < config.videoCount && attempts < maxAttempts) {
        attempts++;
        try {
            const randomChannel = channelList[Math.floor(Math.random() * channelList.length)];
            
            // 1. Search using the OLD LOGIC (TikWM)
            const videoData = await searchTikTok(randomChannel);

            if (videoData) {
                console.log(`✨ Found: ${videoData.title.substring(0, 20)}...`);
                
                // 2. Download
                const filePath = await downloadVideo(videoData.url, videoData.id);

                if (filePath) {
                    const stats = fs.statSync(filePath);
                    
                    // Size Check (Reduced to 50KB to catch smaller videos)
                    if (stats.size < 50000) { 
                        console.log(`⚠️ Very Small File (${stats.size}). Skipping.`);
                        fs.unlinkSync(filePath);
                        continue; // මෙය යැව්වේ නෑ, ඊළඟ වටයට යන්න
                    }

                    console.log(`📤 Uploading: ${videoData.id}`);

                    

                    // --- 🛑 අලුත් වෙනස්කම මෙතනින් ---
                    
                    // 1. Hashtags අයින් කිරීම (# ලකුණ සහ ඊට පස්සේ තියෙන වචනය මැකීම)
                    let cleanDesc = videoData.title.replace(/#\S+/g, "").trim();

                    // 2. ඔයාගේ කෑල්ල (Footer) එකතු කරන්න
                    // පහත "Uploaded by Shaluka Bot" කියන තැනට ඔයාට ඕන එක ලියන්න
                    let myFooter = "\n\n──────────────────\n>  ➤ ᴜᴘʟᴏᴀᴅᴇᴅ ʙʏ : _ᴘᴀsɪʏᴀ.ǫᴜᴏᴛᴇs\n> ➤ ᴘᴏᴡᴇʀᴇᴅ ʙʏ : sʜ𝟺ʟᴜ_ᴢ";
 

                    // 3. Send
                    await sock.sendMessage(from, { 
                        video: fs.readFileSync(filePath),
                        caption: cleanDesc + myFooter, // Hashtag නැති Text එක + ඔයාගේ කෑල්ල
                        mimetype: 'video/mp4'
                    });


                    // Update History
                    history.push(videoData.id);
                    if(history.length > 1000) history.shift();
                    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
                    
                    fs.unlinkSync(filePath);
                    console.log(`✅ Sent (${sentCount + 1}/${config.videoCount}): ${videoData.id}`);
                    
                    sentCount++; // සාර්ථකව යැව්වාම විතරක් ගණන් කරන්න
                    
                    await new Promise(r => setTimeout(r, 5000));
                }
            } else {
                console.log(`⚠️ No new videos for ${randomChannel} (Attempt ${attempts})`);
            }

        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }
    }

    if (sentCount === 0) {
        await sock.sendMessage(from, { text: "❌ කිසිම අලුත් වීඩියෝවක් හමු වුණේ නෑ." });
    } else {
        await sock.sendMessage(from, { text: `✅ Done! Sent ${sentCount} videos.` });
    }
}
// 👇 කලින් කෝඩ් එකේ තිබ්බ හොඳම Search Logic එක
async function searchTikTok(username) {
    console.log(`🔍 Searching: ${username}...`);
    
    // TikWM Feed Search (Best method from your old code)
    try {
        const { data } = await axios.post('https://www.tikwm.com/api/feed/search', 
            `keywords=${username}&count=10&cursor=0&web=1&hd=1`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        if (data?.data?.videos) {
            // History Check
            const fresh = data.data.videos.filter(v => !history.includes(v.video_id));
            
            if (fresh.length > 0) {
                const v = fresh[Math.floor(Math.random() * fresh.length)];
                // කෙලින්ම Video Link එක හදාගන්නවා
                const cleanUrl = `https://www.tikwm.com${v.play}`; 
                return { 
                    id: v.video_id, 
                    url: cleanUrl, 
                    title: v.title 
                };
            }
        }
    } catch (e) {
        console.log(`⚠️ Search Error: ${e.message}`);
    }
    return null;
}

// --- DOWNLOADER ---
async function downloadVideo(url, id) {
    try {
        const filePath = path.join(tempDir, `${id}.mp4`);
        const writer = fs.createWriteStream(filePath);

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (e) {
        console.log(`❌ DL Error: ${e.message}`);
        return null;
    }
}

connectToWhatsApp();