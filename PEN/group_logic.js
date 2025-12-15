const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const Media = require('./media_logic'); 
const yts = require('yt-search'); 
const axios = require('axios');

// ============================================================
// 📂 SYSTEM CONFIGURATION & ASSETS
// ============================================================
const GROUPS_DIR = CONFIG.FILES.groupsDir;
const GLOBAL_SETTINGS_FILE = CONFIG.FILES.settings;
const BAD_WORDS_FILE = CONFIG.FILES.badWords;

// 🖼️ DEFAULT IMAGE (Ensure 'assets/default.jpg' exists in your bot root)
const DEFAULT_IMG_PATH = path.join(__dirname, 'assets', 'default.jpg'); 

// 🧠 RUNTIME MEMORY (Volatile)
let ACTIVE_MATH_GAMES = {}; 

// Ensure Database Directory Exists
if (!fs.existsSync(GROUPS_DIR)) fs.mkdirSync(GROUPS_DIR, { recursive: true });

// Load Forbidden Words
let BAD_WORDS = [];
try { BAD_WORDS = JSON.parse(fs.readFileSync(BAD_WORDS_FILE)); } catch(e) { BAD_WORDS = []; }

const saveBadWords = () => fs.writeFileSync(BAD_WORDS_FILE, JSON.stringify(BAD_WORDS, null, 2));

// Random Facts Database
const FACTS = [
    "Honey never spoils.", "Octopuses have three hearts.", 
    "Bananas are berries.", "Water makes up about 60% of the human body.",
    "The Eiffel Tower can be 15 cm taller during the summer.",
    "A day on Venus is longer than a year on Venus."
];

// ============================================================
// 🛠️ DATABASE MANAGEMENT (READ/WRITE)
// ============================================================
function getGroupDB(jid) {
    const filePath = path.join(GROUPS_DIR, `${jid}.json`);
    
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath));
    } else {
        // Default Schema
        const defaultData = {
            group_id: jid,
            settings: {
                // 🛡️ SECURITY
                antilink: false, 
                antibadword: false, 
                antifake: false, 
                antiviewonce: false, 
                antighost: true, // Anti-Spam Tagging
                
                // 🎵 MEDIA
                autotiktok: true, 
                autofb: true, 
                autospotify: true, 
                autoplaylist: false,

                // ⚙️ FEATURES
                welcome_sys: false, 
                games_sys: false, 
                rank_sys: false, 
                extras_sys: false,
                mood_detector: true,

                // 📝 TEXTS
                welcome_msg: "Welcome to the community! Please respect the rules.", 
                bye_msg: "Goodbye! We hope to see you again."
            },
            members: {}, 
            warnings: {}, 
            afk_users: {}, 
            smart_stats: { 
                mood_score: { anger: 0, happy: 50, spam: 0 } 
            }
        };
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

function updateGroupDB(jid, data) {
    const filePath = path.join(GROUPS_DIR, `${jid}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================
// 👋 EVENT HANDLER: WELCOME & GOODBYE (PREMIUM ENGLISH)
// ============================================================
async function handleGroupEvent(sock, update) {
    const { id, participants, action } = update;
    
    // Check Global Master Switch
    let GLOBAL_SETTINGS = {};
    try { GLOBAL_SETTINGS = JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_FILE)); } catch(e) {}
    if (GLOBAL_SETTINGS.g_welcome === false) return; 

    // Check Group Local Switch
    let db = getGroupDB(id);
    if (!db.settings.welcome_sys) return; 

    // Fetch Group Metadata
    let groupMeta;
    try { groupMeta = await sock.groupMetadata(id); } catch(e) { groupMeta = { subject: 'Community', participants: [] }; }

    for (const participant of participants) {
        const user = participant.id || String(participant);
        if (!user.includes('@')) continue;
        const userName = user.split('@')[0];

        // 🖼️ 1. Resolve Profile Picture
        let ppUrl;
        try { ppUrl = await sock.profilePictureUrl(user, 'image'); } catch (e) { ppUrl = null; }
        
        // 🖼️ 2. Determine Image Source (DP or Default)
        const imageMessage = ppUrl 
            ? { url: ppUrl } 
            : (fs.existsSync(DEFAULT_IMG_PATH) ? fs.readFileSync(DEFAULT_IMG_PATH) : null);
        
        // 🕒 3. Timestamp
        const date = new Date().toLocaleDateString('en-GB');
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        // 👋 HANDLE ADD (WELCOME)
        if (action === 'add') {
            const welcomeCaption = `
┏━━━〔 ✨ 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 〕━━━┓
┃
┃ 👤 *Member:* @${userName}
┃ 🏠 *Group:* ${groupMeta.subject}
┃ 🔢 *Count:* #${groupMeta.participants.length}
┃ 📅 *Joined:* ${date} at ${time}
┃
┣━━━━━━━━━━━━━━━━━━┫
┃
┃ Hello and warm greetings! 👋
┃ We are thrilled to have you here.
┃ Please verify the rules and make yourself at home.
┃
┗━━━━━━━━━━━━━━━━━━┛

❝ _${db.settings.welcome_msg}_ ❞
            `.trim();

            if (imageMessage) await sock.sendMessage(id, { image: imageMessage, caption: welcomeCaption, mentions: [user] });
            else await sock.sendMessage(id, { text: welcomeCaption, mentions: [user] });

        // 👋 HANDLE REMOVE (GOODBYE)
        } else if (action === 'remove') {
            const byeCaption = `
┏━━━〔 🥀 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 〕━━━┓
┃
┃ 👤 *User:* @${userName}
┃ 🏠 *From:* ${groupMeta.subject}
┃ 📉 *Remaining:* ${groupMeta.participants.length - 1}
┃
┗━━━━━━━━━━━━━━━━━━┛

It's sad to see you go. Best of luck on your journey!
            `.trim();

            if (imageMessage) await sock.sendMessage(id, { image: imageMessage, caption: byeCaption, mentions: [user] });
            else await sock.sendMessage(id, { text: byeCaption, mentions: [user] });
        }
    }
}

// ============================================================
// ⚙️ MAIN LOGIC CONTROLLER
// ============================================================
async function handleGroupLogic(sock, msg, text, sender, from, isOwner) {
    if (!from.endsWith('@g.us')) return; 

    // Load Global & Local Configs
    let GLOBAL_SETTINGS = { tiktok: true, fb: true, spotify: true, media: true, g_welcome: true, g_games: true, g_rank: true, g_extras: true, g_playlist: true }; 
    try { GLOBAL_SETTINGS = JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_FILE)); } catch(e) {}

    let db = getGroupDB(from);
    let settings = db.settings; 
    let saveNeeded = false;      

    // Get Group Participants
    let participants = [];
    try { participants = (await sock.groupMetadata(from)).participants; } catch(e) {}

    const senderNum = sender.split('@')[0];
    const isSenderAdmin = isOwner || participants.some(p => p.id.includes(senderNum) && (p.admin === 'admin' || p.admin === 'superadmin'));
    const botNum = sock.user.id.split(':')[0];
    const isBotAdmin = participants.some(p => p.id.includes(botNum) && (p.admin === 'admin' || p.admin === 'superadmin'));
    const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // ============================================================
    // 🧠 1. MATH GAME ANSWER VALIDATION
    // ============================================================
    if (ACTIVE_MATH_GAMES[from]) {
        let answer = parseInt(text.trim());
        if (!isNaN(answer) && answer === ACTIVE_MATH_GAMES[from].answer) {
            const duration = ((Date.now() - ACTIVE_MATH_GAMES[from].time) / 1000).toFixed(1);
            await sock.sendMessage(from, { text: `✅ *Correct Answer!* 🧠\n🏆 Winner: @${senderNum}\n⏱️ Time: ${duration}s`, mentions: [sender] }, { quoted: msg });
            delete ACTIVE_MATH_GAMES[from];
            return; 
        }
    }

    // ============================================================
    // 💤 2. AFK SYSTEM (AUTO-REPLY & RESTORE)
    // ============================================================
    // A. User returns (Speaks) -> Remove AFK
    if (db.afk_users && db.afk_users[sender]) {
        delete db.afk_users[sender];
        saveNeeded = true;
        await sock.sendMessage(from, { text: `👋 *Welcome Back* @${senderNum}!\nAFK status removed.`, mentions: [sender] }, { quoted: msg });
    }
    // B. Someone tags AFK user -> Notify
    if (mentions.length > 0 && db.afk_users) {
        for (let m of mentions) {
            if (db.afk_users[m]) {
                const info = db.afk_users[m];
                await sock.sendMessage(from, { text: `🤫 *Shh!* @${m.split('@')[0]} is currently AFK.\n📝 Reason: ${info.reason}\n⏰ Since: ${new Date(info.time).toLocaleTimeString()}`, mentions: [m] }, { quoted: msg });
            }
        }
    }

    // ============================================================
    // 🛡️ 3. SECURITY & AUTOMATION
    // ============================================================
    
    // A. Anti-Fake (Foreign Numbers)
    if (settings.antifake && !isSenderAdmin) {
        if (senderNum.startsWith('212') || senderNum.startsWith('92') || senderNum.startsWith('1')) {
            if (isBotAdmin) { 
                await sock.sendMessage(from, { text: "🚫 *Security Alert:* Fake/Foreign number detected. Banned." }); 
                await sock.groupParticipantsUpdate(from, [sender], "remove"); 
            }
            return;
        }
    }

    // B. Anti-Link (Smart Whitelist)
    if (settings.antilink && !isSenderAdmin) {
        const links = text.match(/(https?:\/\/[^\s]+)/g);
        if (links) {
            const whitelist = ['google.com', 'youtube.com', 'youtu.be', 'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com', 'spotify.com'];
            
            // Check if link is NOT in whitelist
            const isBadLink = links.some(link => !whitelist.some(w => link.includes(w))); 
            // Explicitly block WhatsApp Group links even if whitelisted
            const isGroupLink = links.some(l => l.includes('chat.whatsapp.com'));

            if (isBadLink || isGroupLink) {
                if (isBotAdmin) { 
                    await sock.sendMessage(from, { delete: msg.key }); 
                    await sock.sendMessage(from, { text: `⚠️ *Link Removed!* @${senderNum}`, mentions: [sender] });
                } else {
                    await sock.sendMessage(from, { text: `⚠️ *Links are prohibited!*` });
                }
                return;
            }
        }
    }

    // C. Anti-Ghost (Spam Tag Detection)
    if (settings.antighost && !isSenderAdmin && mentions.length > 5) {
        if (isBotAdmin) await sock.sendMessage(from, { delete: msg.key });
        await sock.sendMessage(from, { text: `🚫 *Anti-Spam:* Excessive tagging is not allowed.` });
        return;
    }

    // D. Anti-Badword
    if (settings.antibadword && !isSenderAdmin && BAD_WORDS.length > 0) {
        if (BAD_WORDS.some(w => text.toLowerCase().includes(w.toLowerCase()))) {
            if (isBotAdmin) await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, { text: `⚠️ *Language Warning!*` });
            return;
        }
    }

    // E. Anti-ViewOnce (Detect & Reveal)
    if (settings.antiviewonce && msg.message?.viewOnceMessageV2) {
        const vo = msg.message.viewOnceMessageV2.message;
        const type = Object.keys(vo)[0];
        const media = await sock.downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        
        let caption = `👁️ *Anti-ViewOnce Detected*\n👤 User: @${senderNum}`;
        if (vo[type].caption) caption += `\n📝 Caption: ${vo[type].caption}`;

        await sock.sendMessage(from, { [type === 'imageMessage' ? 'image' : 'video']: media, caption: caption, mentions: [sender] });
        return;
    }

    // ============================================================
    // 🔗 4. AUTO MEDIA DOWNLOADERS
    // ============================================================
    if (!text.startsWith('.')) {
        if (GLOBAL_SETTINGS.media) {
            // TikTok
            if (settings.autotiktok && GLOBAL_SETTINGS.tiktok && text.includes('tiktok.com')) await Media.downloadTikTok(text, sock, from);
            // Facebook
            if (settings.autofb && GLOBAL_SETTINGS.fb && (text.includes('facebook.com') || text.includes('fb.watch'))) await Media.downloadFB(text, sock, from);
            // Spotify
            if (settings.autospotify && GLOBAL_SETTINGS.spotify && (text.includes('spotify.com') || text.includes('spotify.link'))) await Media.downloadSpotify(text, sock, from);
            
            // YouTube Playlist (Auto-Loop)
            if (settings.autoplaylist && GLOBAL_SETTINGS.g_playlist && text.includes('youtube.com/playlist')) {
                 await sock.sendMessage(from, { text: "🔄 *Playlist Detected:* Processing songs..." });
                 try {
                     let listId = text.match(/[?&]list=([^#\&\?]+)/)?.[1];
                     if(listId) {
                         // Fetch playlist items (Limit to 10 for safety)
                         const vids = (await yts({ listId: listId })).videos.slice(0, 10);
                         for(let v of vids) {
                             await Media.handleSong(sock, from, `.ss https://youtu.be/${v.videoId}`);
                             await new Promise(r => setTimeout(r, 15000)); // 15s delay between songs
                         }
                         await sock.sendMessage(from, { text: "✅ Playlist Download Complete." });
                     }
                 } catch(e) {}
            }
        }
        return;
    }

    // ============================================================
    // 🚀 5. COMMAND EXECUTION CENTER
    // ============================================================
    const parts = text.trim().split(' ');
    const rawCmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const argText = args.join(" ");

    // 🔥 COMPLETE COMMAND MAP
    const cmdMap = {
        // Admin Panel
        '.admin': '.panel', '.panel': '.panel', '.menu': '.panel',
        
        // User Actions
        '.k': '.kick', '.kick': '.kick', '.remove': '.kick',
        '.a': '.add', '.add': '.add',
        '.p': '.promote', '.promote': '.promote',
        '.d': '.demote', '.demote': '.demote',
        '.w': '.warn', '.warn': '.warn',
        '.mt': '.mute', '.mute': '.mute',
        '.umt': '.unmute', '.unmute': '.unmute',
        '.h': '.hidetag', '.hidetag': '.hidetag',
        '.del': '.delete', '.delete': '.delete',
        '.tagall': '.tagall', '.tagadmins': '.tagadmins',
        
        // System Toggles
        '.wel': '.welcome', '.welcome': '.welcome',
        '.gm': '.games', '.games': '.games',
        '.rnk': '.rank', '.rank': '.rank',
        '.ex': '.extras', '.extras': '.extras',
        
        // Security Toggles
        '.alink': '.antilink', '.antilink': '.antilink',
        '.abw': '.antibadword', '.antibadword': '.antibadword',
        '.afake': '.antifake', '.antifake': '.antifake',
        '.avo': '.antiviewonce', '.antiviewonce': '.antiviewonce',
        '.aghost': '.antighost', '.antighost': '.antighost',
        
        // Media Toggles
        '.att': '.autotiktok', '.autotiktok': '.autotiktok',
        '.afb': '.autofb', '.autofb': '.autofb',
        '.asp': '.autospotify', '.autospotify': '.autospotify',
        '.plist': '.playlist', '.playlist': '.playlist',
        
        // Public Tools
        '.g': '.google', '.google': '.google',
        '.s': '.sticker', '.sticker': '.sticker',
        '.afk': '.setafk', '.setafk': '.setafk',
        '.dic': '.define', '.define': '.define',
        '.ping': '.ping', '.ss': '.ss', '.weather': '.weather',

        // Games
        '.math': '.math', '.ship': '.ship', '.rank': '.rank', '.fact': '.fact',

        // Configuration
        '.setname': '.setname', '.setdesc': '.setdesc', 
        '.setwelcome': '.setwelcome', '.setbye': '.setbye',
        '.addbadword': '.addbadword', '.resetgroup': '.resetgroup'
    };
    
    const cmd = cmdMap[rawCmd] || rawCmd;

    // ---------------------------------------------------
    // 🔥 MODERN ADMIN PANEL (Redesigned & Professional)
    // ---------------------------------------------------
    if (cmd === '.panel') {
        if (!isSenderAdmin) return sock.sendMessage(from, { text: "🚫 *Access Denied:* Admins Only." });
        
        const s = (v) => v ? '🟢' : '🔴'; // Status Indicators
        
        const menuText = `
┏━━━〔 🛡️ 𝐀𝐃𝐌𝐈𝐍 𝐂𝐎𝐍𝐒𝐎𝐋𝐄 〕━━━┓
┃
┃ 👮 *Admin:* @${senderNum}
┃ 🏠 *Group:* ${from.split('@')[0]}
┃ 📡 *System:* Online
┃
┣━━ ⚙️ *SYSTEM CONTROL* ━━━━━┫
┃
┃ ${s(settings.welcome_sys)} Welcome    ${s(settings.games_sys)} Games
┃ ${s(settings.rank_sys)} Rank       ${s(settings.extras_sys)} Tools
┃
┣━━ 🔒 *SECURITY PROTOCOLS* ━━┫
┃
┃ ${s(settings.antilink)} Anti-Link
┃ ${s(settings.antibadword)} Bad-Word
┃ ${s(settings.antifake)} Anti-Fake
┃ ${s(settings.antiviewonce)} Anti-ViewOnce
┃ ${s(settings.antighost)} Anti-Spam
┃
┣━━ 🎵 *MEDIA AUTOMATION* ━━━━┫
┃
┃ ${s(settings.autotiktok)} TikTok     ${s(settings.autofb)} FB
┃ ${s(settings.autospotify)} Spotify    ${s(settings.autoplaylist)} Playlist
┃
┣━━ ⚡ *MANAGEMENT TOOLS* ━━━━┫
┃
┃ 👤 .k .a .p .d (Manage Users)
┃ 🔒 .mt .umt (Lock/Unlock)
┃ 📢 .h .tagall (Announce)
┃ 🗑️ .del (Clean)
┃
┗━━━━━━━━━━━━━━━━━━━━━━┛
_Type any command above to toggle or execute._
`;

        const panelImage = fs.existsSync(DEFAULT_IMG_PATH) ? fs.readFileSync(DEFAULT_IMG_PATH) : null;
        
        // Send to INBOX
        if (panelImage) await sock.sendMessage(sender, { image: panelImage, caption: menuText });
        else await sock.sendMessage(sender, { text: menuText });
        
        await sock.sendMessage(from, { text: "📩 *Dashboard Sent!* Please check your inbox." });
    }

    // ---------------------------------------------------
    // 🌍 PUBLIC COMMANDS
    // ---------------------------------------------------
    if (cmd === '.google') {
        if (!argText) return sock.sendMessage(from, { text: "🔎 Please enter a search term." });
        await sock.sendMessage(from, { text: `🔎 *Google Search:* ${argText}\n🔗 https://www.google.com/search?q=${args.join("+")}` });
    }
    if (cmd === '.ss') await Media.handleSong(sock, from, text);
    if (cmd === '.weather') await Media.handleWeather(sock, from, text);
    if (cmd === '.ping') await sock.sendMessage(from, { text: `Pong! ⚡\nLatency: ${Date.now() - msg.messageTimestamp * 1000}ms` });
    
    if (cmd === '.sticker') await sock.sendMessage(from, { text: "♻️ *Sticker:* Reply to an image to convert." });

    if (cmd === '.setafk') {
        if (!db.afk_users) db.afk_users = {};
        db.afk_users[sender] = { reason: argText || "Busy", time: Date.now() };
        saveNeeded = true;
        await sock.sendMessage(from, { text: `💤 *AFK Mode Activated!*` });
    }

    if (cmd === '.define') {
        try {
            const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${args[0]}`);
            const def = res.data[0].meanings[0].definitions[0].definition;
            await sock.sendMessage(from, { text: `📚 *Dictionary:*\nWord: ${args[0]}\nDefinition: ${def}` });
        } catch {
            await sock.sendMessage(from, { text: "❌ Word not found in dictionary." });
        }
    }

    // ---------------------------------------------------
    // 🎮 GAMES & FUN
    // ---------------------------------------------------
    if (settings.games_sys && GLOBAL_SETTINGS.g_games !== false) {
        if (cmd === '.math') {
            const a = Math.floor(Math.random() * 50) + 1;
            const b = Math.floor(Math.random() * 50) + 1;
            ACTIVE_MATH_GAMES[from] = { answer: a + b, time: Date.now() };
            await sock.sendMessage(from, { text: `🧠 *Math Challenge*\nCalculate: ${a} + ${b} = ?` });
        }
        if (cmd === '.ship') {
            const p = Math.floor(Math.random() * 100);
            await sock.sendMessage(from, { text: `💘 *Love Calculator*\n@${senderNum} ❤️ @${mentions[0]?.split('@')[0] || "Someone"}\nMatch Score: ${p}%`, mentions: [sender, mentions[0] || sender] });
        }
        if (cmd === '.fact') await sock.sendMessage(from, { text: `💡 *Did you know?*\n${FACTS[Math.floor(Math.random() * FACTS.length)]}` });
    }

    // ---------------------------------------------------
    // 👮 ADMIN ACTIONS & TOGGLES
    // ---------------------------------------------------
    if (isSenderAdmin) {
        // Feature Toggles
        const toggle = async (k, n) => { 
            settings[k] = args[0] === 'on' ? true : (args[0] === 'off' ? false : !settings[k]); 
            saveNeeded = true; 
            await sock.sendMessage(from, { text: `${n}: ${settings[k] ? '✅ ENABLED' : '🔴 DISABLED'}` }); 
        };
        
        if (cmd === '.welcome') await toggle('welcome_sys', 'Welcome Msg');
        if (cmd === '.games') await toggle('games_sys', 'Games System');
        if (cmd === '.rank') await toggle('rank_sys', 'Ranking System');
        if (cmd === '.extras') await toggle('extras_sys', 'Extra Tools');
        
        if (cmd === '.antilink') await toggle('antilink', 'Anti-Link Protection');
        if (cmd === '.antibadword') await toggle('antibadword', 'Profanity Filter');
        if (cmd === '.antifake') await toggle('antifake', 'Fake Number Blocker');
        if (cmd === '.antiviewonce') await toggle('antiviewonce', 'Anti-ViewOnce');
        if (cmd === '.antighost') await toggle('antighost', 'Anti-Spam Tagging');
        
        if (cmd === '.autotiktok') await toggle('autotiktok', 'Auto TikTok Downloader');
        if (cmd === '.autofb') await toggle('autofb', 'Auto Facebook Downloader');
        if (cmd === '.autospotify') await toggle('autospotify', 'Auto Spotify Downloader');
        if (cmd === '.playlist') await toggle('autoplaylist', 'Auto YouTube Playlist');

        // Group Actions
        const doAct = async (act, usrs) => {
            if (!isBotAdmin) return sock.sendMessage(from, { text: "❌ *Error:* Bot requires Admin privileges." });
            if (!usrs.length) return sock.sendMessage(from, { text: "⚠️ You must tag a user." });
            await sock.sendMessage(from, { text: `⏳ Processing ${usrs.length} users...` });
            for (const u of usrs) { try { await sock.groupParticipantsUpdate(from, [u], act); await new Promise(r=>setTimeout(r,500)); } catch(e) {} }
            await sock.sendMessage(from, { text: "✅ Operation Successful." });
        };
        
        if (cmd === '.kick') await doAct("remove", mentions);
        if (cmd === '.add') await doAct("add", mentions);
        if (cmd === '.promote') await doAct("promote", mentions);
        if (cmd === '.demote') await doAct("demote", mentions);
        
        if (cmd === '.mute') { await sock.groupSettingUpdate(from, 'announcement'); await sock.sendMessage(from, { text: "🔒 *Group Muted* (Admins Only)" }); }
        if (cmd === '.unmute') { await sock.groupSettingUpdate(from, 'not_announcement'); await sock.sendMessage(from, { text: "🔓 *Group Unmuted* (Open)" }); }
        
        if (cmd === '.hidetag') await sock.sendMessage(from, { text: argText || "📢 *Attention!*", mentions: participants.map(p=>p.id) });
        if (cmd === '.tagall') {
             let txt = `📢 *GROUP ANNOUNCEMENT*\n${argText}\n\n`;
             for (let p of participants) txt += `➥ @${p.id.split('@')[0]}\n`;
             await sock.sendMessage(from, { text: txt, mentions: participants.map(p=>p.id) });
        }
        
        if (cmd === '.delete') {
            if (msg.message.extendedTextMessage?.contextInfo?.stanzaId) {
                const key = { remoteJid: from, id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: msg.message.extendedTextMessage.contextInfo.participant };
                await sock.sendMessage(from, { delete: key });
            }
        }
        
        if (cmd === '.setwelcome') { settings.welcome_msg = argText; saveNeeded = true; await sock.sendMessage(from, { text: "✅ Welcome Message Updated" }); }
        if (cmd === '.setbye') { settings.bye_msg = argText; saveNeeded = true; await sock.sendMessage(from, { text: "✅ Goodbye Message Updated" }); }
        if (cmd === '.setname') await sock.groupUpdateSubject(from, argText); 
        if (cmd === '.setdesc') await sock.groupUpdateDescription(from, argText); 
        
        if (cmd === '.addbadword' && args[0]) { BAD_WORDS.push(args[0]); saveBadWords(); sock.sendMessage(from, { text: `✅ Word "${args[0]}" added to blocklist.` }); }
        if (cmd === '.resetgroup') { try { fs.unlinkSync(path.join(GROUPS_DIR, `${from}.json`)); sock.sendMessage(from, { text: "⚠️ Group Configurations Reset." }); } catch{} }
    }

    if (saveNeeded) updateGroupDB(from, db);
}

module.exports = { handleGroupLogic, handleGroupEvent };