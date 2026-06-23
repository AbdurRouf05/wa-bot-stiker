// commands/qc.js
// Quote Creator — WhatsApp-style chat bubble sticker
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ==== coba load @napi-rs/canvas (buat balon chat) ====
let createCanvas, GlobalFonts;
try {
  ({ createCanvas, GlobalFonts } = require("@napi-rs/canvas"));
} catch (e) {
  createCanvas = null;
  GlobalFonts = null;
  console.log(
    "[qc] module '@napi-rs/canvas' tidak tersedia, fitur .qc akan dimatikan di environment ini."
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

// Palet warna untuk nama kontak (mirip WA)
const NAME_COLORS = [
  "#e15e5e", // merah
  "#d4a03c", // emas
  "#5bbb6f", // hijau
  "#4faadb", // biru muda
  "#7c6ed4", // ungu
  "#d4556e", // pink
  "#d48c3c", // oranye
  "#4dc0b5", // teal
];

function getNameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

/**
 * .qc - Quote Creator — Buat stiker gelembung chat cantik
 * - .qc teks
 * - reply pesan lalu ketik .qc
 */
export default async ({ sock, msg, from, args }) => {
  // Kalau canvas atau sharp tidak tersedia, jangan crash
  if (!createCanvas || !sharp) {
    await sock.sendMessage(
      from,
      {
        text:
          "Fitur *.qc* belum tersedia di environment ini.\n" +
          "Diperlukan module *@napi-rs/canvas* dan *sharp*.",
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
    quotedMsg = ext.contextInfo;
  }

  if (quotedMsg) {
    const participant = quotedMsg.participant || quotedMsg.remoteJid || "";

    // Coba ambil nama kontak dari contacts store di Baileys
    let contactName = null;
    try {
      // Baileys menyimpan contacts di sock.contacts (jika sudah di-bind)
      const contact = sock.contacts?.[participant];
      contactName = contact?.name || contact?.notify || contact?.pushName || null;
    } catch {}

    displayName = contactName
      || formatPhoneNumber(participant)
      || "User";

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
    displayName = msg.pushName || formatPhoneNumber(sender) || "User";
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

  // ===== DESAIN BUBBLE CHAT ala WhatsApp =====
  const PADDING = 28;
  const BUBBLE_PAD_X = 24;
  const BUBBLE_PAD_Y = 16;
  const NAME_FONT_SIZE = 26;
  const TEXT_FONT_SIZE = 28;
  const LINE_HEIGHT = TEXT_FONT_SIZE * 1.4;
  const MAX_TEXT_WIDTH = 560;
  const TAIL_SIZE = 16;

  // Measure text 
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");

  // Ukur nama
  measureCtx.font = `bold ${NAME_FONT_SIZE}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  const nameWidth = measureCtx.measureText(displayName).width;

  // Word wrap teks
  measureCtx.font = `${TEXT_FONT_SIZE}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  const textLines = wrapText(measureCtx, text, MAX_TEXT_WIDTH);

  // Cari lebar teks terpanjang
  let maxLineWidth = nameWidth;
  for (const line of textLines) {
    const w = measureCtx.measureText(line).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }

  // Hitung dimensi bubble
  const bubbleWidth = Math.min(maxLineWidth + BUBBLE_PAD_X * 2, MAX_TEXT_WIDTH + BUBBLE_PAD_X * 2);
  const bubbleHeight = NAME_FONT_SIZE + 10 + textLines.length * LINE_HEIGHT + BUBBLE_PAD_Y * 2;
  const canvasWidth = PADDING * 2 + bubbleWidth + TAIL_SIZE;
  const canvasHeight = PADDING * 2 + bubbleHeight + TAIL_SIZE;

  // ===== GAMBAR BUBBLE =====
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const bubbleX = PADDING + TAIL_SIZE;
  const bubbleY = PADDING;
  const radius = 16;
  const nameColor = getNameColor(displayName);

  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;

  // Bubble background
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, radius);
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Tail (segitiga kecil di kiri atas)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(bubbleX, bubbleY + 12);
  ctx.lineTo(bubbleX - TAIL_SIZE, bubbleY + 6);
  ctx.lineTo(bubbleX, bubbleY + 28);
  ctx.closePath();
  ctx.fill();

  // Garis aksen warna di atas (seperti WhatsApp group)
  ctx.fillStyle = nameColor;
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleWidth, 4, [radius, radius, 0, 0]);
  ctx.fill();

  // Nama pengirim
  ctx.fillStyle = nameColor;
  ctx.font = `bold ${NAME_FONT_SIZE}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(displayName, bubbleX + BUBBLE_PAD_X, bubbleY + BUBBLE_PAD_Y + 4);

  // Isi pesan
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `${TEXT_FONT_SIZE}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  let textY = bubbleY + BUBBLE_PAD_Y + NAME_FONT_SIZE + 14;
  for (const line of textLines) {
    ctx.fillText(line, bubbleX + BUBBLE_PAD_X, textY);
    textY += LINE_HEIGHT;
  }

  // ===== RENDER =====
  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();

  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};

// Format nomor telepon agar lebih readable (6281234567890 → +62 812-3456-7890)
function formatPhoneNumber(jid) {
  const num = jid.split("@")[0];
  if (!num || num.length < 8) return num;
  return `+${num.slice(0, 2)} ${num.slice(2, 5)}-${num.slice(5, 9)}-${num.slice(9)}`;
}

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
function wrapText(ctx, text, maxWidth) {
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
