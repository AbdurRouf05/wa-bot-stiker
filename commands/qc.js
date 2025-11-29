// commands/qc.js
// Quote Creator seperti WhatsApp bubble asli

// ==== coba load canvas (buat balon chat) ====
let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require("canvas"));
} catch (e) {
  createCanvas = null;
  loadImage = null;
  console.log(
    "[qc] module 'canvas' tidak tersedia, fitur .qc akan dimatikan di environment ini."
  );
}

// ==== coba load sharp (convert PNG -> WebP) ====
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
  console.log(
    "[qc] module 'sharp' tidak tersedia, fitur .qc akan dimatikan di environment ini."
  );
}

const fetch = (...a) => import("node-fetch").then(({ default: f }) => f(...a));

/**
 * .qc - Quote Creator seperti WhatsApp bubble asli
 * - .qc teks
 * - reply pesan lalu ketik .qc
 */
module.exports = async ({ sock, msg, from, args }) => {
  // Kalau canvas atau sharp tidak tersedia (Termux), jangan bikin bot crash
  if (!createCanvas || !loadImage || !sharp) {
    await sock.sendMessage(
      from,
      {
        text:
          "Fitur *.qc* belum tersedia di environment ini.\n" +
          "Diperlukan module *canvas* dan *sharp* yang tidak bisa dipasang di Termux.",
      },
      { quoted: msg }
    );
    return;
  }

  const m = msg.message || {};
  const ext = m.extendedTextMessage;

  let displayName = "";
  let text = args.join(" ");

  // ===== tentukan target (reply atau tidak) =====
  let quotedMsg = null;
  if (ext && ext.contextInfo && ext.contextInfo.quotedMessage) {
    // user reply pesan orang lain
    quotedMsg = ext.contextInfo;
  }

  if (quotedMsg) {
    // kalau reply, ambil nama & pesan dari target reply
    const participant = quotedMsg.participant || quotedMsg.remoteJid || "";
    displayName =
      quotedMsg.mentionedJid?.[0] ||
      quotedMsg.displayName ||
      participant.split("@")[0] ||
      "User";

    const qMsg = quotedMsg.quotedMessage || quotedMsg.message || {};
    text =
      qMsg.conversation ||
      qMsg.extendedTextMessage?.text ||
      qMsg.imageMessage?.caption ||
      qMsg.videoMessage?.caption ||
      text ||
      "";
  } else {
    // kalau tidak reply, pakai nama pengirim sendiri
    const sender = msg.key?.participant || msg.key?.remoteJid || "";
    displayName = sender.split("@")[0] || "User";
  }

  if (!text.trim()) {
    await sock.sendMessage(
      from,
      {
        text:
          "Contoh:\n" +
          "• *.qc Halo semuanya*\n" +
          "• Reply pesan lalu ketik *.qc*",
      },
      { quoted: msg }
    );
    return;
  }

  // ===== gambar bubble chat ala WhatsApp =====
  const width = 800;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // background transparan
  ctx.clearRect(0, 0, width, height);

  // balon chat putih
  const bubbleX = 40;
  const bubbleY = 80;
  const bubbleW = width - 80;
  const bubbleH = height - 140;
  const radius = 30;

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, radius);
  ctx.fill();

  // Nama pengirim
  ctx.fillStyle = "#128C7E"; // hijau WA
  ctx.font = "bold 36px Sans";
  ctx.textAlign = "left";
  ctx.fillText(displayName, bubbleX + 30, bubbleY + 50);

  // Isi pesan
  ctx.fillStyle = "#000000";
  ctx.font = "28px Sans";

  const lines = wrapText(ctx, text, bubbleX + 30, bubbleY + 90, bubbleW - 60, 36);
  let textY = bubbleY + 90;
  for (const line of lines) {
    ctx.fillText(line, bubbleX + 30, textY);
    textY += 36;
  }

  // Tail bubble (ekor ke kiri)
  ctx.beginPath();
  ctx.moveTo(bubbleX + 60, bubbleY + bubbleH);
  ctx.lineTo(bubbleX + 40, bubbleY + bubbleH + 30);
  ctx.lineTo(bubbleX + 120, bubbleY + bubbleH);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();

  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};

// Helper: rounded rectangle
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper: wrap text ke beberapa baris
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? line + " " + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}
