const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    delay 
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// 1. අහඹු වෙලාවක් තෝරාගන්නා ෆන්ක්ෂන් එක
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// 2. නම්බර් එක සුද්ද කරන ෆන්ක්ෂන් එක
function cleanNumber(rawNumber) {
    // ඉලක්කම් ඇරෙන්න අනිත්වා අයින් කරනවා (-, +, spaces)
    let clean = rawNumber.replace(/\D/g, ''); 

    if (clean.length < 9) return null;
    
    // 0න් පටන් ගනී නම් 94 දානවා
    if (clean.startsWith('0')) {
        clean = '94' + clean.slice(1);
    }
    // 94 නැත්නම් සහ අංක 9ක් නම් (උදා: 77xxxxxxx) 94 දානවා
    if (!clean.startsWith('94') && clean.length === 9) {
        clean = '94' + clean;
    }
    
    return clean + '@s.whatsapp.net';
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n👇 QR Code එක ස්කෑන් කරන්න:\n");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot Connected!');
            console.log('👉 contacts.vcf ෆයිල් එක දාලා ".startgroups" ගහන්න.');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            if (!from.endsWith('@s.whatsapp.net')) return;

            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (body.trim() === '.startgroups') {
                await createGroupsLogic(sock, from);
            }

        } catch (err) {
            console.log(err);
        }
    });
}

async function createGroupsLogic(sock, userJid) {
    let participantList = [];
    
    // --- VCF CONTACTS FILE කියවීම ---
    try {
        const vcfData = fs.readFileSync('contacts.vcf', 'utf8');
        const lines = vcfData.split(/\r?\n/);
        console.log(`📂 VCF ෆයිල් එකේ පේළි ${lines.length} ක් තිබේ. කියවමින්...`);

        // VCF ෆයිල් එකේ "TEL" කියන පේළි විතරක් හොයලා නම්බර්ස් ගන්නවා
        lines.forEach(line => {
            if (line.includes('TEL') || line.includes('WAID')) {
                // නම්බර් එක Extract කරගැනීම
                const formatted = cleanNumber(line);
                if (formatted) participantList.push(formatted);
            }
        });
        
        // ඩුප්ලිකේට් අයින් කිරීම
        participantList = [...new Set(participantList)];

    } catch (err) {
        console.log("❌ Error: contacts.vcf ෆයිල් එක නෑ.");
        await sock.sendMessage(userJid, { text: "⚠️ contacts.vcf ෆයිල් එක ෆෝල්ඩරයට දාන්න." });
        return;
    }

    if (participantList.length === 0) {
        await sock.sendMessage(userJid, { text: "⚠️ VCF ෆයිල් එකේ නම්බර්ස් හොයාගන්න බැරි වුණා." });
        return;
    }

    await sock.sendMessage(userJid, { text: `Contacts ${participantList.length} ක් VCF එකෙන් ගත්තා. වැඩේ පටන් ගන්නවා...` });

    // Group Descriptions
    const desc1 = `▌══════════════════════════════════▐

🎥 BG AUTO VIDEOS ONLY

🌌 Smooth • Loop • Aesthetic Backgrounds

🤖 Fully Automated Upload System

🚫 No Chat | No Spam | Content Only

🎬 Perfect for Editors, Reels & Shorts
📥 Uploaded by : bn pasoya.quotes

⚡ Powered by : sh4lu_z

▌══════════════════════════════════▐`;

    const desc2 = `▌══════════════════════════════════▐

💬 AUTO QUOTES VIDEOS

🧠 Motivation • Life • Feelings • Mindset

🎞️ Auto Generated Quote Videos

🤖 100% Automated Posting System

🚫 No Chat | Videos Only
📥 Uploaded by : bn pasoya.quotes

⚡ Powered by : sh4lu_z

▌══════════════════════════════════▐`;

    try {
        console.log("🔨 Group 1 හදමින්...");
        const group1 = await sock.groupCreate("🎥 BG AUTO VIDEOS ONLY", [userJid]);
        await sock.groupUpdateDescription(group1.id, desc1);
        console.log(`✅ Group 1 Created: ${group1.id}`);
        
        console.log("🔨 Group 2 හදමින්...");
        const group2 = await sock.groupCreate("💬 AUTO QUOTES VIDEOS", [userJid]);
        await sock.groupUpdateDescription(group2.id, desc2);
        console.log(`✅ Group 2 Created: ${group2.id}`);

        // --- ADDING LOGIC (Human-Like) ---
        
        const batchSize = 5; 
        const minDelay = 10000; // 10s
        const maxDelay = 25000; // 25s

        console.log("🔄 Members ඇඩ් කිරීම ආරම්භ කරයි...");

        for (let i = 0; i < participantList.length; i += batchSize) {
            const batch = participantList.slice(i, i + batchSize);
            
            try {
                await sock.groupParticipantsUpdate(group1.id, batch, "add");
                await delay(2000); // පොඩි විවේකයක්
                await sock.groupParticipantsUpdate(group2.id, batch, "add");
                
                console.log(`➕ Batch ${Math.floor(i/batchSize) + 1} ඇඩ් කළා.`);
            } catch (err) {
                console.log(`⚠️ Batch Error: ${err.message}`);
            }
            
            if (i + batchSize < participantList.length) {
                const waitTime = getRandomDelay(minDelay, maxDelay);
                console.log(`⏳ Human Wait: තත්පර ${Math.floor(waitTime / 1000)} ක් ඉන්නවා...`);
                await delay(waitTime);
            }
        }

        console.log("✅ WORK DONE");
        await sock.sendMessage(userJid, { 
            text: `✅ *වැඩේ ඉවරයි!*\n\n*Group 1 ID:* ${group1.id}\n*Group 2 ID:* ${group2.id}\nTotal Processed: ${participantList.length}` 
        });

    } catch (e) {
        console.error("Critical Error:", e);
        await sock.sendMessage(userJid, { text: "⚠️ Error: " + e.message });
    }
}

startBot();