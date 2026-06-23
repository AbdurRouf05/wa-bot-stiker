// commands/qc.js
// Quote Creator — WhatsApp-style chat bubble sticker (authentic design)
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ==== coba load @napi-rs/canvas ====
let createCanvas, GlobalFonts;
try {
  ({ createCanvas, GlobalFonts } = require("@napi-rs/canvas"));
} catch (e) {
  createCanvas = null;
  console.log(
    "[qc] module '@napi-rs/canvas' tidak tersedia, fitur .qc akan dimatikan di environment ini."
  );
}

// ==== coba load sharp ====
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
  console.log(
    "[qc] module 'sharp' tidak tersedia, fitur .qc akan dimatikan di environment ini."
  );
}

// Palet warna nama kontak (sama seperti WhatsApp di grup)
const NAME_COLORS = [
  "#e06055", "#d4813e", "#c1a835", "#6fba57",
  "#45bfa5", "#5bb5d4", "#6f8cd4", "#a87bd4",
];

function getNameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

// Font family dengan emoji support
const FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Segoe UI", Arial, sans-serif';

export default async ({ sock, msg, from, args }) => {
  if (!createCanvas || !sharp) {
    await sock.sendMessage(from, {
      text: "Fitur *.qc* belum tersedia di environment ini.\nDiperlukan *@napi-rs/canvas* dan *sharp*.",
    }, { quoted: msg });
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

    // Ambil nama dari contacts store (disimpan oleh index.js)
    const contact = sock.contacts?.[participant];
    displayName = contact?.notify || contact?.name || contact?.pushName
      || formatPhoneNumber(participant)
      || "User";

    // Ambil teks dari pesan yang di-reply
    const qMsg = quotedMsg.quotedMessage || {};
    text =
      qMsg.conversation ||
      qMsg.extendedTextMessage?.text ||
      qMsg.imageMessage?.caption ||
      qMsg.videoMessage?.caption ||
      text ||
      "";
  } else {
    const sender = msg.key?.participant || msg.key?.remoteJid || "";
    displayName = msg.pushName || formatPhoneNumber(sender) || "User";
  }

  if (!text.trim()) {
    await sock.sendMessage(from, {
      text: "Contoh:\n• *.qc Halo semuanya*\n• Reply pesan lalu ketik *.qc*",
    }, { quoted: msg });
    return;
  }

  // ============================================================
  //  RENDER BUBBLE CHAT ALA WHATSAPP
  // ============================================================

  const PAD_H = 24;       // padding horizontal dalam bubble
  const PAD_V = 14;       // padding vertikal dalam bubble
  const NAME_SIZE = 24;
  const TEXT_SIZE = 28;
  const LINE_H = Math.round(TEXT_SIZE * 1.45);
  const MAX_W = 520;      // lebar teks maksimal
  const RADIUS = 18;      // radius sudut bubble
  const CANVAS_PAD = 40;  // ruang kosong di sekitar bubble (transparan)
  const TAIL_W = 12;      // lebar ekor bubble

  // --- Ukur teks ---
  const tmp = createCanvas(1, 1);
  const tctx = tmp.getContext("2d");

  tctx.font = `bold ${NAME_SIZE}px ${FONT}`;
  const nameW = tctx.measureText(displayName).width;

  tctx.font = `${TEXT_SIZE}px ${FONT}`;
  const lines = wrapText(tctx, text, MAX_W);
  let maxLineW = nameW;
  for (const l of lines) {
    const w = tctx.measureText(l).width;
    if (w > maxLineW) maxLineW = w;
  }

  // --- Hitung dimensi ---
  const bubbleW = Math.min(maxLineW, MAX_W) + PAD_H * 2;
  const contentH = NAME_SIZE + 8 + lines.length * LINE_H;
  const bubbleH = contentH + PAD_V * 2;

  const cW = CANVAS_PAD * 2 + TAIL_W + bubbleW;
  const cH = CANVAS_PAD * 2 + bubbleH;

  // --- Canvas ---
  const canvas = createCanvas(cW, cH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, cW, cH);

  const bx = CANVAS_PAD + TAIL_W; // bubble x (setelah ekor)
  const by = CANVAS_PAD;           // bubble y

  // --- Shadow ---
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  // --- Bubble body (rounded rect) ---
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(bx, by, bubbleW, bubbleH, RADIUS);
  ctx.fill();

  // --- Ekor kiri atas (seperti WA incoming) ---
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(bx, by + 4);
  ctx.lineTo(bx - TAIL_W, by);
  ctx.lineTo(bx, by + 22);
  ctx.closePath();
  ctx.fill();

  // Timpa sudut kiri atas agar menyatu mulus dengan ekor
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx, by, RADIUS, 22);

  // --- Garis hijau tipis di atas bubble (aksen WA group) ---
  const nameColor = getNameColor(displayName);
  ctx.fillStyle = nameColor;
  ctx.beginPath();
  ctx.roundRect(bx, by, bubbleW, 4, [RADIUS, RADIUS, 0, 0]);
  ctx.fill();

  // --- Nama ---
  ctx.fillStyle = nameColor;
  ctx.font = `bold ${NAME_SIZE}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(displayName, bx + PAD_H, by + PAD_V + 2);

  // --- Teks pesan ---
  ctx.fillStyle = "#111b21";
  ctx.font = `${TEXT_SIZE}px ${FONT}`;
  let ty = by + PAD_V + NAME_SIZE + 10;
  for (const line of lines) {
    ctx.fillText(line, bx + PAD_H, ty);
    ty += LINE_H;
  }

  // --- Render ---
  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();
  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};

// Format nomor agar readable
function formatPhoneNumber(jid) {
  const num = (jid || "").split("@")[0];
  if (!num || num.length < 8) return num || "User";
  return `+${num.slice(0, 2)} ${num.slice(2, 5)}-${num.slice(5, 9)}-${num.slice(9)}`;
}

// Word wrap
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
