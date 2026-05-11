import { webcrypto } from "node:crypto";
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

import "dotenv/config";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import P from "pino";
import path from "path";
import fs from "fs";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";
import { tmp, getMediaBuffer } from "./utils.js";
import db from "./utils/db.js";

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

async function start() {
  await loadCommands();

  // path folder auth (session Baileys)
  const authDir = path.join(__dirname, "auth");
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // ====== Session String Handler ======
  const sessionId = process.env.SESSION_ID;
  if (sessionId && !fs.existsSync(path.join(authDir, "creds.json"))) {
    try {
      console.log("💾 Mendeteksi SESSION_ID, memulihkan sesi...");
      const creds = Buffer.from(sessionId, "base64").toString("utf-8");
      fs.writeFileSync(path.join(authDir, "creds.json"), creds);
    } catch (e) {
      console.error("❌ Gagal decode SESSION_ID:", e.message);
    }
  }

  const phoneNumber = process.argv[2] || process.env.OWNER;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📡 Menggunakan WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket.default ? makeWASocket.default({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: phoneNumber ? ["Chrome", "Chrome", "130.0.0"] : ["Abdbot", "Chrome", "1.0.0"],
  }) : makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: phoneNumber ? ["Chrome", "Chrome", "130.0.0"] : ["Abdbot", "Chrome", "1.0.0"],
  });

  // Pairing Code Logic
  if (phoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n🔑 PAIRING CODE: ${code}\n`);
      } catch (err) {
        console.error("❌ Gagal request pairing code:", err.message);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !phoneNumber) qrcode.generate(qr, { small: true });

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        fs.rmSync(authDir, { recursive: true, force: true });
        setTimeout(() => start(), 3000);
      } else {
        setTimeout(() => start(), 5000);
      }
    } else if (connection === "open") {
      console.log("✅ Bot sudah terhubung ke WhatsApp!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const isMe = msg.key.fromMe;
    const text = getTextFromMessage(msg).trim();
    const isGroup = from.endsWith("@g.us");

    // Database access
    const groupData = isGroup ? db.getGroup(from) : null;
    const userData = db.getUser(msg.key.participant || from);

    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong 🏓" }, { quoted: msg });
      return;
    }

    if (!text.startsWith(".")) return;

    const [rawCmd, ...args] = text.slice(1).split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const handler = commands[cmd];

    if (!handler) return;

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
  });
}

start();
