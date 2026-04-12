import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

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
import { fileURLToPath } from "url";
import { tmp, getMediaBuffer } from "./utils.js";

// Import all commands (ESM requires .js extension)
import menu from "./commands/menu.js";
import sticker from "./commands/sticker.js";
import brat from "./commands/brat.js";
import qc from "./commands/qc.js";
import deleteCmd from "./commands/delete.js";
import hidetag from "./commands/hidetag.js";
import remini from "./commands/remini.js";
import yt from "./commands/yt.js";
import tiktok from "./commands/tiktok.js";
import ig from "./commands/ig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Web Server (for Cloud) ======
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is active! 🚀"));
app.listen(port, () => console.log(`🌍 Server berjalan di port ${port}`));

// Daftar command
const commands = {
  menu,
  s: sticker,
  toimg: sticker,
  img: sticker,
  tomp4: sticker,
  brat,
  qc,
  delete: deleteCmd,
  hidetag,
  remini,
  yt,
  tt: tiktok,
  ig,
};

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

  // Cek apakah pakai pairing code (nomor HP sebagai argument atau env)
  const phoneNumber = process.argv[2] || process.env.OWNER;

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  // Ambil versi WA terbaru agar tidak kena 405
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📡 Menggunakan WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket.default ? makeWASocket.default({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: phoneNumber
      ? ["Chrome", "Chrome", "130.0.0"]
      : ["Abdbot", "Chrome", "1.0.0"],
  }) : makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: phoneNumber
      ? ["Chrome", "Chrome", "130.0.0"]
      : ["Abdbot", "Chrome", "1.0.0"],
  });

  // ====== Pairing Code (untuk Termux) ======
  if (phoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n🔑 ═══════════════════════════════════`);
        console.log(`🔑  PAIRING CODE: ${code}`);
        console.log(`🔑 ═══════════════════════════════════`);
        console.log(`\n📱 Buka WhatsApp → ⋮ → Perangkat tertaut`);
        console.log(`   → Tautkan dengan nomor telepon`);
        console.log(`   → Masukkan kode di atas\n`);
      } catch (err) {
        console.error("❌ Gagal request pairing code:", err.message);
      }
    }, 3000);
  }

  // ====== QR & koneksi ======
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan QR hanya jika TIDAK pakai pairing code
    if (qr && !phoneNumber) {
      console.log("=== Scan QR ini pakai WhatsApp HP kamu ===");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;

      console.log("Connection closed. status:", statusCode);

      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        console.log("⚠️ Session ter-logout. Menghapus folder auth & start ulang...");
        try {
          fs.rmSync(authDir, { recursive: true, force: true });
        } catch (e) {}
        console.log("🔄 Restart dalam 3 detik...");
        setTimeout(() => start(), 3000);
      } else {
        console.log("🔄 Reconnect dalam 5 detik...");
        setTimeout(() => start(), 5000);
      }
    } else if (connection === "open") {
      console.log("✅ Bot sudah terhubung ke WhatsApp! (Baileys)");

      // Jika belum pakai SESSION_ID, tampilkan di console untuk dicopy ke Cloud
      if (!process.env.SESSION_ID) {
        const creds = fs.readFileSync(path.join(authDir, "creds.json"));
        const base64 = Buffer.from(creds).toString("base64");
        console.log(`\n=================================================`);
        console.log(`🚀 INI SESSION_ID KAMU (Salin ke Cloud Dashboard):`);
        console.log(`=================================================`);
        console.log(base64);
        console.log(`=================================================\n`);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ====== handler pesan ======
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    const isMe = msg.key.fromMe;
    const text = getTextFromMessage(msg).trim();

    console.log(
      "📩 Dari:",
      from,
      "| fromMe:",
      isMe,
      "| teks:",
      JSON.stringify(text)
    );

    // ping
    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong 🏓" }, { quoted: msg });
      return;
    }

    // hanya command diawali titik
    if (!text.startsWith(".")) return;

    const withoutDot = text.slice(1).trim();
    const parts = withoutDot.split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);

    const handler = commands[cmd];
    if (!handler) {
      // Hilangkan saja auto-reply biar tidak mengganggu
      return;
    }

    const ctx = {
      sock,
      msg,
      from,
      cmd,
      args,
      text,
      tmp,
      getMediaBuffer: (m) => getMediaBuffer(sock, m || msg),
      downloadContentFromMessage,
    };

    try {
      await handler(ctx);
    } catch (err) {
      console.error(`❌ Error di .${cmd}:`, err);
      await sock.sendMessage(
        from,
        { text: `Terjadi error di command .${cmd} 😅` },
        { quoted: msg }
      );
    }
  });
}

start();
