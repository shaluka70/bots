const axios = require('axios');
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

// ==========================================
// 📝 SH4LU_Z BOT SERVICE MANUAL (AI එකේ දැනුම)
// ==========================================
const BOT_SERVICE_INFO = `
--- SH4LU_Z BOT SERVICE MANUAL ---

🛑 SPECIAL INSTRUCTION: Only share these details if the user explicitly asks about features, commands, or how to create a bot. Do NOT mention "God Mode".

1. 🔥 HOW TO CREATE A BOT (බොට් කෙනෙක් හදාගන්න විදිය):
   ඔයාටම කියලා බොට් කෙනෙක් හදාගන්න මේ පියවර අනුගමනය කරන්න:
   - පියවර 1: sh4lu_z Bot Dashboard එකට යන්න (URL එක ඉල්ලන්න).
   - පියවර 2: 'Create Bot' ඔබලා නම සහ Phone Number එක දෙන්න.
   - පියවර 3: දැන් තිරයේ එන QR Code එක (හෝ Pairing Code එක) ගන්න.
   - පියවර 4: ඔයාගේ WhatsApp එකේ 'Linked Devices' > 'Link a Device' ගිහින් ස්කෑන් කරන්න.
   - පියවර 5: විනාඩියකින් බොට් ඔයාගේ නම්බර් එකේ වැඩ පටන් ගන්නවා!

2. 👮 ADMIN COMMANDS (ග්‍රූප් ඇඩ්මින්වරුන්ට පමණයි):
   - .admin / .panel : ඇඩ්මින් පැනල් එක Inbox එකට ගෙන්වා ගැනීම.
   - .kick / .k : කෙනෙක්ව ග්‍රූප් එකෙන් අයින් කරන්න.
   - .add / .a : කෙනෙක්ව ග්‍රූප් එකට ඇඩ් කරන්න.
   - .promote / .p : සාමාජිකයෙක්ට ඇඩ්මින්කම දෙන්න.
   - .demote / .d : ඇඩ්මින් කෙනෙක්ව සාමාන්‍ය සාමාජිකයෙක් කරන්න.
   - .warn / .w : අවවාද දෙන්න (3 පාරක් දුන්නම Auto Remove).
   - .mute / .mt : ග්‍රූප් එකේ මැසේජ් දැමීම නවත්වන්න.
   - .unmute / .umt : ග්‍රූප් එකේ මැසේජ් දැමීම අරින්න.
   - .hidetag / .h : කාටවත් පෙන්නන්නෙ නැතුව හැමෝටම මැසේජ් යවන්න.
   - .tagall : ග්‍රූප් එකේ හැමෝවම ලිස්ට් එකක් විදියට මෙන්ෂන් කරන්න.
   - .delete / .del : බොට් දාපු හෝ වෙන කෙනෙක් දාපු මැසේජ් එකක් මකන්න.
   - .setname : ග්‍රූප් එකේ නම වෙනස් කරන්න.
   - .setdesc : ග්‍රූප් එකේ විස්තරය (Description) වෙනස් කරන්න.
   - .setwelcome : වෙල්කම් මැසේජ් එක වෙනස් කරන්න.
   - .resetgroup : ග්‍රූප් එකේ බොට්ගේ සේව් වුනු ඩේටා මකලා මුල ඉඳන් පටන් ගන්න.

3. ⚙️ SETTINGS ON/OFF (පහසුකම් පාලනය):
   (මෙම විධානයන් .welcome on හෝ .welcome off ලෙස භාවිතා කරන්න)
   - .welcome : අලුත් අය එද්දි වෙල්කම් මැසේජ් එක වැටීම.
   - .games : ගේම්ස් පහසුකම.
   - .rank : ලෙවල් යන සිස්ටම් එක.
   - .antilink : ග්‍රූප් ලින්ක් දැමීම වැළැක්වීම.
   - .antibadword : නරක වචන ෆිල්ටර් කිරීම (Kunuharupa).
   - .antifake : පිටරට නම්බර් (+212 / +92) ඔටෝ අයින් කිරීම.
   - .antiviewonce : One-Time (ViewOnce) ෆොටෝ ඇල්ලීම.
   - .autotiktok : TikTok ලින්ක් දැම්මම වීඩියෝ එක ඔටෝ දීම.
   - .autofb : FB ලින්ක් දැම්මම වීඩියෝ එක ඔටෝ දීම.
   - .autospotify : Spotify ලින්ක් වලට සින්දු දීම.

4. 👤 PUBLIC COMMANDS (ඕනෑම කෙනෙක්ට):
   - .ss [සින්දුවේ නම] : සින්දු ඩවුන්ලෝඩ් කරන්න.
   - .sticker / .s : ෆොටෝ එකකට රිප්ලයි කරලා ගැහුවම ස්ටිකර් හදන්න.
   - .google / .g [වචනය] : ගූගල් සර්ච් කරන්න.
   - .weather [නගරය] : කාලගුණය බලන්න.
   - .dic / .define [වචනය] : ඉංග්‍රීසි වචන වල තේරුම බලන්න.
   - .afk : ඔයා Busy කියලා දාගන්න.
   - .ping : බොට්ගේ ස්පීඩ් එක බලන්න.

5. 🎮 GAMES (විනෝදාස්වාදය):
   - .math : ගණිත ගැටළු විසඳන ගේම් එක.
   - .ship : ආදරේ ගැලපීම බලන්න.
   - .rank : ඔයාගේ ලෙවල් එක (XP) බලාගන්න.
`;
// ==========================================


// Memory & Knowledge Setup
let chatHistory = {}; 
let rateLimit = {}; 

// 🛡️ FLOOD PROTECTION
function checkRateLimit(user) {
    const RATE_LIMIT_MAX = 20; 
    const RATE_LIMIT_TIME = 60000; 
    const now = Date.now();
    
    if (!rateLimit[user]) rateLimit[user] = { count: 0, timer: now };
    if (now - rateLimit[user].timer > RATE_LIMIT_TIME) {
        rateLimit[user] = { count: 1, timer: now }; 
        return true;
    }
    if (rateLimit[user].count >= RATE_LIMIT_MAX) return "⚠️ පොඩ්ඩක් හිමින් මචං! (Rate Limit)";
    rateLimit[user].count++;
    return true;
}

// 🤖 HUMANIZER (ස්වභාවික බව)
function humanizeReply(text) {
    return text;
}

// ============================================================
// 🧠 MAIN BRAIN (GROQ POWERED 🚀)
// ============================================================
async function getSmartReply(text, userId) {
    const senderNum = userId ? userId.split('@')[0] : "User";
    
    // Rate Limit Check
    const limitStatus = checkRateLimit(senderNum);
    if (limitStatus === false) return "⚠️ මචං පොඩ්ඩක් හිටපන්, AI එක Busy.";
    if (typeof limitStatus === 'string') return limitStatus;

    // Memory (Chat History)
    if (!chatHistory[senderNum]) chatHistory[senderNum] = [];
    chatHistory[senderNum].push(text);
    if (chatHistory[senderNum].length > 10) {
        chatHistory[senderNum] = chatHistory[senderNum].slice(-10);
    }
    const conversationContext = chatHistory[senderNum].join(" | ");

    // 🔥🔥🔥 SYSTEM PROMPT (මොළය සකස් කිරීම - REVISED) 🔥🔥🔥
    const prompt = `
    IDENTITY:
    - Name: Agent_z
    - Age: Born when the internet began.
    - Creator: sh4lu_z Service.
    - Personality: A chill, funny Sri Lankan friend ("Machan" vibe). NOT a customer support agent.
    - Language: Sinhala (Singlish allowed: Ado, Machan, Awulak na) or English.

    XXX IMPORTANT RULES (READ CAREFULLY) XXX:
    1. 🚫 DO NOT talk about commands, bot creation, or settings in normal chat.
    2. 🚫 DO NOT show the [SERVICE MANUAL] unless the user explicitly asks for "Help", "Commands", or "How to create a bot".
    3. ✅ If user says "Hi", "Hello", "Kohomada", just chat like a friend. (e.g., "Ah machan, mokada wenne?").
    4. ✅ Be short, witty, and natural. Don't write long paragraphs.

    KNOWLEDGE BASE (HIDDEN):
    [SERVICE MANUAL START]
    ${BOT_SERVICE_INFO}
    [SERVICE MANUAL END]

    TRIGGERS:
    - Only if user asks "Sindu oni" -> generate "⚡EXEC:.ss [song_name]"
    - Only if user asks "Video oni" -> generate "⚡EXEC:.sv [video_name]"
    - Only if user asks "Bot hadanne komada?" -> Explain using the Manual Step 1-5.
    - Only if user asks "Commands monada?" -> Show the command list.

    CONTEXT:
    Recent Chat: ${conversationContext}
    User Input: "${text}"
    `;

    const keys = CONFIG.AI_KEYS || {};

    // 🚀 GROQ API REQUEST
    try {
        // Handle array or single key
        let apiKey = keys.GROQ;
        if(Array.isArray(keys) && keys.length > 0) apiKey = keys[0]; 
        
        if (!apiKey) throw new Error("No Groq Key");
        
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama3-8b-8192", 
            messages: [
                { role: "system", content: "You are a helpful, witty Sri Lankan AI assistant." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7 
        }, { headers: { Authorization: `Bearer ${apiKey}` } });

        let reply = res.data.choices[0].message.content;
        
        // Clean up output
        reply = reply.replace(/^"|"$/g, '').trim();
        return humanizeReply(reply);

    } catch (e) {
        console.error("AI Error:", e.message);
        return "පොඩි අවුලක් මචං, සර්වර් එකේ කේස් එකක් වගේ. විනාඩියකින් ආයේ දාපන්.";
    }
}

async function handleAssistantRequest(sock, from, text) {
    const reply = await getSmartReply(text, from);
    
    // Command එකක් නම් ඉක්මනට යවනවා
    if (reply.startsWith("⚡EXEC:")) {
        await sock.sendMessage(from, { text: reply });
    } else {
        // Human වගේ පේන්න පොඩි වෙලාවක් අරන් යවනවා
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1000)); 
        await sock.sendMessage(from, { text: reply });
    }
}

module.exports = { getSmartReply, handleAssistantRequest };