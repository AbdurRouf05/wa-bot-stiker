// index.js — Baileys, router command modular

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const path = require("path");
const { tmp, getMediaBuffer } = require("./utils");

// Di bagian commands, tambah pn:
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
  ig: require("./commands/ig")
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
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, "auth")
  );

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Abdbot", "Chrome", "1.0.0"],
  });

  // QR code
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("Scan QR ini:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("Connection closed, reconnect:", shouldReconnect);
      if (shouldReconnect) start();
    } else if (connection === "open") {
      console.log("✅ Bot sudah terhubung ke WhatsApp! (Baileys)");
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