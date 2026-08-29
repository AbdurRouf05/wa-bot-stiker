import { webcrypto } from "node:crypto";
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

import "dotenv/config";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import P from "pino";
import path from "path";
import fs from "fs";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";
import { tmp, getMediaBuffer } from "./utils.js";
import db from "./utils/db.js";
import { handleGameInput } from "./utils/gameHandler.js";

// ====== Inisialisasi Game State ======
if (!global.games) {
  global.games = {
    tebakkata: {},
    ttt: {}
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Web Server (for Cloud) ======
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is active! 🚀"));
app.listen(port, () => console.log(`🌍 Server berjalan di port ${port}`));

// ====== Dynamic Command Loader ======
const commands = {};
const commandsDir = path.join(__dirname, "commands");

async function loadCommands() {
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    try {
      const fullPath = path.join(commandsDir, file);
      // Gunakan pathToFileURL agar kompatibel dengan Windows ESM import
      const module = await import(pathToFileURL(fullPath).href);
      
      // Ambil nama command dari filename (misal: menu.js -> menu)
      const cmdName = file.replace(".js", "");
      commands[cmdName] = module.default;

      // Register alias jika ada (optional: bisa ditambahkan di dalam file command nantinya)
      if (cmdName === "sticker") {
        commands["s"] = module.default;
        commands["toimg"] = module.default;
        commands["img"] = module.default;
        commands["tomp4"] = module.default;
      }
      if (cmdName === "tiktok") commands["tt"] = module.default;
      if (cmdName === "delete") commands["del"] = module.default;
      if (cmdName === "brat") {
        commands["bratvid"] = module.default;
        commands["bratgif"] = module.default;
      }
    } catch (e) {
      console.error(`❌ Gagal memuat command ${file}:`, e.message);
    }
  }
  console.log(`📦 Loaded ${Object.keys(commands).length} commands.`);
}

// helper: ambil teks dari berbagai tipe message
function getTextFromMessage(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  );
}

let sock = null;
let isReconnecting = false;
let pairingCodeRequested = false;

// path folder auth (session Baileys)
const authDir = path.join(__dirname, "auth");
const badSessionFile = path.join(__dirname, ".bad_session");

function restoreSessionIdIfPresent() {
  const sessionId = process.env.SESSION_ID;
  if (sessionId && !fs.existsSync(path.join(authDir, "creds.json"))) {
    let isBad = false;
    if (fs.existsSync(badSessionFile)) {
      const badSessionId = fs.readFileSync(badSessionFile, "utf-8");
      if (badSessionId === sessionId) {
        isBad = true;
        console.log("⚠️ SESSION_ID saat ini rusak/kedaluwarsa. Mengabaikan pemulihan sesi.");
      } else {
        // SESSION_ID sudah diganti yang baru, hapus file bad_session
        try { fs.unlinkSync(badSessionFile); } catch {}
      }
    }

    if (!isBad) {
      try {
        console.log("💾 Mendeteksi SESSION_ID, memulihkan sesi...");
        const creds = Buffer.from(sessionId, "base64").toString("utf-8");
        fs.writeFileSync(path.join(authDir, "creds.json"), creds);
      } catch (e) {
        console.error("❌ Gagal decode SESSION_ID:", e.message);
      }
    }
  }
}

async function connectToWhatsApp() {
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // Bersihkan instance socket lama agar tidak ada memory leak / listener tumpang tindih
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      if (typeof sock.end === "function") sock.end();
    } catch (e) {
      console.error("⚠️ Cleanup socket lama error:", e.message);
    }
    sock = null;
  }

  restoreSessionIdIfPresent();

  const phoneNumber = process.argv[2] || process.env.OWNER;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
    isLatest: false,
  }));

  console.log(`📡 Menggunakan WA v${version.join(".")}, isLatest: ${isLatest}`);

  const socketOptions = {
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: phoneNumber ? ["Chrome", "Chrome", "130.0.0"] : ["Abdbot", "Chrome", "1.0.0"],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    defaultQueryTimeoutMs: 60000,
    emitOwnEvents: false,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidNewsletter(jid) || isJidStatusBroadcast(jid),
    getMessage: async () => undefined,
  };

  sock = makeWASocket.default ? makeWASocket.default(socketOptions) : makeWASocket(socketOptions);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    // Selalu tampilkan QR code di terminal sebagai alternatif jika Pairing Code gagal
    if (qr) {
      console.log("\n📷 SCAN QR CODE DI BAWAH INI JIKA PAIRING CODE GAGAL:\n");
      qrcode.generate(qr, { small: true });

      // Hanya request Pairing Code JIKA WhatsApp benar-benar meminta otentikasi (mengeluarkan QR)
      if (phoneNumber && !pairingCodeRequested) {
        pairingCodeRequested = true;
        setTimeout(async () => {
          try {
            if (sock && !sock.authState?.creds?.registered) {
              const code = await sock.requestPairingCode(phoneNumber);
              console.log(`\n🔑 PAIRING CODE: ${code}\n`);
            }
          } catch (err) {
            console.error("❌ Gagal request pairing code:", err.message);
          }
        }, 2000);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isBadSession = lastDisconnect?.error?.message?.includes("Bad MAC");

      console.log(`⚠️ Koneksi terputus. Status: ${statusCode || "unknown"}. isBadSession: ${Boolean(isBadSession)}`);

      if (isReconnecting) return;
      isReconnecting = true;

      if (isLoggedOut) {
        console.log("⚠️ Session ter-logout. Menghapus folder auth...");
        if (process.env.SESSION_ID) {
          try { fs.writeFileSync(badSessionFile, process.env.SESSION_ID); } catch {}
        }
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
        pairingCodeRequested = false;

        console.log("🔄 Menghubungkan ulang untuk membuat sesi baru dalam 3 detik...");
        setTimeout(() => {
          isReconnecting = false;
          connectToWhatsApp();
        }, 3000);
      } else {
        const retryDelay = (statusCode === DisconnectReason.restartRequired || statusCode === 515) ? 1500 : 5000;
        console.log(`🔄 Menyambung kembali secara otomatis dalam ${retryDelay / 1000} detik...`);
        setTimeout(() => {
          isReconnecting = false;
          connectToWhatsApp();
        }, retryDelay);
      }
    } else if (connection === "open") {
      isReconnecting = false;
      pairingCodeRequested = false;
      console.log("✅ Bot WhatsApp berhasil terhubung!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ====== Simpan kontak agar QC bisa menampilkan nama, bukan nomor ======
  if (!sock.contacts) sock.contacts = {};
  
  sock.ev.on("contacts.upsert", (contacts) => {
    for (const contact of contacts) {
      sock.contacts[contact.id] = {
        ...(sock.contacts[contact.id] || {}),
        ...contact,
      };
    }
  });

  sock.ev.on("contacts.update", (updates) => {
    for (const update of updates) {
      if (sock.contacts[update.id]) {
        Object.assign(sock.contacts[update.id], update);
      } else {
        sock.contacts[update.id] = update;
      }
    }
  });

  // ====== Fitur Welcome ======
  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update;
    
    if (action === "add") {
      try {
        const metadata = await sock.groupMetadata(id);
        const groupName = metadata.subject;
        const groupData = db.getGroup(id);
        
        // Asumsi fitur welcome selalu menyala kecuali explicitly dimatikan
        if (groupData.welcome !== false) {
          for (const num of participants) {
            let ppUrl;
            try { ppUrl = await sock.profilePictureUrl(num, "image"); } 
            catch { ppUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"; }
            
            let text = `👋 Halo @${num.split("@")[0]}!\nSelamat datang di grup *${groupName}*.\n\n`;
            text += `🤖 *INFO BOT ABD* 🤖\n`;
            text += `Saya adalah bot asisten grup ini. Anda bisa menggunakan berbagai fitur seru di sini!\n\n`;
            text += `📖 *PANDUAN SINGKAT*\n`;
            text += `Ketik perintah berawalan titik (\`.\`) untuk berinteraksi dengan saya. Contoh: \`.menu\`\n\n`;
            text += `*DAFTAR MENU UTAMA:*\n`;
            text += ` ⊳ .yt / .tt / .ig (Download Video)\n`;
            text += ` ⊳ .s / .smeme (Buat Sticker)\n`;
            text += ` ⊳ .profile (Cek Status RPG)\n`;
            text += ` ⊳ .ttt (Tic-Tac-Toe)\n`;
            text += ` ⊳ .math (Kalkulator Pintar)\n\n`;
            text += `Ketik *.menu* untuk melihat seluruh fitur secara lengkap! 🎉`;
            await sock.sendMessage(id, { image: { url: ppUrl }, caption: text, mentions: [num] });
          }
        }
      } catch (err) { console.error("Welcome Error:", err); }
    } else if (action === "remove") {
      try {
        const metadata = await sock.groupMetadata(id);
        const groupName = metadata.subject;
        const groupData = db.getGroup(id);
        
        if (groupData.welcome !== false) {
          for (const num of participants) {
            const text = `👋 Bye @${num.split("@")[0]}!\nTelah keluar dari *${groupName}*.`;
            await sock.sendMessage(id, { text, mentions: [num] });
          }
        }
      } catch (err) {}
    }
  });

  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of msgs) {
      if (!msg || !msg.message) continue;

      const from = msg.key.remoteJid;
      if (!from || isJidBroadcast(from) || isJidNewsletter(from) || isJidStatusBroadcast(from)) continue;

      // Update contacts pushName
      if (msg.pushName) {
        const jid = msg.key?.participant || from;
        if (jid && !isJidBroadcast(jid)) {
          if (!sock.contacts[jid]) sock.contacts[jid] = {};
          sock.contacts[jid].notify = msg.pushName;
        }
      }

      const isMe = msg.key.fromMe;
      const text = getTextFromMessage(msg).trim();
      if (!text) continue;

      const isGroup = from.endsWith("@g.us");

      // Database access
      const senderJid = isGroup ? (msg.key.participant || from) : (isMe ? (sock.user?.id?.split(":")[0] + "@s.whatsapp.net" || from) : from);
      const groupData = isGroup ? db.getGroup(from) : null;
      const userData = db.getUser(senderJid);

      // ==========================================
      // SISTEM VERIFIKASI KONTAK (vCard)
      // ==========================================
      const isContact = msg.message.contactMessage || msg.message.contactsArrayMessage;
      if (isContact) {
        let vcard = "";
        if (msg.message.contactMessage) {
          vcard = msg.message.contactMessage.vcard || "";
        } else {
          const contacts = msg.message.contactsArrayMessage.contacts || [];
          vcard = contacts.map(c => c.vcard).join(" ");
        }
        
        const vcardLower = vcard.toLowerCase();
        // Validasi sederhana: vcard harus mengandung nama "abdbot"
        if (vcardLower.includes("abdbot")) {
          db.updateUser(senderJid, { isVerified: true });
          await sock.sendMessage(from, { text: "✅ Verifikasi Sukses!\nTerima kasih telah menyimpan kontak bot. Anda sekarang dapat menggunakan semua perintah (command) bot ini." }, { quoted: msg });
          continue;
        }
      }

      // Intercept game input (jawaban) sebelum mengecek prefix "."
      const isGameHandled = await handleGameInput({ sock, msg, from, text, isGroup });
      if (isGameHandled) continue;

      if (text.toLowerCase() === "ping") {
        await sock.sendMessage(from, { text: "pong 🏓" }, { quoted: msg });
        continue;
      }

      if (!text.startsWith(".")) continue;

      // Bypass verifikasi untuk Owner / self message
      const ownerNumber = process.env.OWNER || "";
      const isOwner = isMe || (ownerNumber && senderJid.includes(ownerNumber));

      // Cek apakah user sudah terverifikasi sebelum mengeksekusi command
      if (!userData.isVerified && !isOwner) {
        await sock.sendMessage(
          from, 
          { text: "⚠️ *AKSES DITOLAK*\n\nAnda belum terverifikasi! Silakan simpan nomor bot ini dengan nama *abdbot*, lalu kirim/bagikan kontak tersebut ke ruang chat ini (Pilih ikon klip/attachment -> Bagikan Kontak -> Pilih abdbot) untuk memvalidasi akun Anda dan mulai menggunakan bot." }, 
          { quoted: msg }
        );
        continue;
      }

      const [rawCmd, ...args] = text.slice(1).split(/\s+/);
      const cmd = rawCmd.toLowerCase();
      const handler = commands[cmd];

      if (!handler) continue;

      const ctx = {
        sock,
        msg,
        from,
        cmd,
        args,
        text,
        db,
        groupData,
        userData,
        tmp,
        getMediaBuffer: (m) => getMediaBuffer(sock, m || msg),
        downloadContentFromMessage,
      };

      try {
        await handler(ctx);
      } catch (err) {
        console.error(`❌ Error di .${cmd}:`, err);
        await sock.sendMessage(from, { text: `Terjadi error di command .${cmd} 😅` }, { quoted: msg });
      }
    }
  });
}

async function start() {
  await loadCommands();
  await connectToWhatsApp();
}

start();

