require("dotenv").config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const path = require("path");
const fs = require("fs");
const express = require("express");
const { tmp, getMediaBuffer } = require("./utils");

// ====== Web Server (for Cloud) ======
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is active! 🚀"));
app.listen(port, () => console.log(`🌍 Server berjalan di port ${port}`));

// Daftar command
const commands = {
  menu: require("./commands/menu"),
  s: require("./commands/sticker"),
  toimg: require("./commands/sticker"),
  img: require("./commands/sticker"),
  tomp4: require("./commands/sticker"),
  brat: require("./commands/brat"),
  qc: require("./commands/qc"),
  delete: require("./commands/delete"),
  hidetag: require("./commands/hidetag"),
  remini: require("./commands/remini"),
  yt: require("./commands/yt"),
  tt: require("./commands/tiktok"),
  ig: require("./commands/ig"),
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

  const sock = makeWASocket({
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
      await sock.sendMessage(
        from,
        { text: "❌ Command tidak dikenal.\nKetik *.menu*" },
        { quoted: msg }
      );
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
