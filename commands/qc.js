// commands/qc.js — Quote Creator WhatsApp Otentik & Premium
import { createRequire } from "module";
import axios from "axios";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas"));
  if (GlobalFonts) {
    const fontsDir = path.join(__dirname, "..", "assets", "fonts");
    const regularFont = path.join(fontsDir, "Noto-Regular.ttf");
    const boldFont = path.join(fontsDir, "Noto-Bold.ttf");
    const emojiFont = path.join(fontsDir, "Noto-Emoji.ttf");

    if (fs.existsSync(regularFont)) GlobalFonts.registerFromPath(regularFont, "NotoSans");
    if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, "NotoSansBold");
    if (fs.existsSync(emojiFont)) GlobalFonts.registerFromPath(emojiFont, "NotoEmoji");
  }
} catch (e) {
  createCanvas = null;
  loadImage = null;
  GlobalFonts = null;
  console.log("[qc] Module '@napi-rs/canvas' tidak tersedia di environment ini.");
}

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
  console.log("[qc] Module 'sharp' tidak tersedia di environment ini.");
}

// Palet warna nama kontak WhatsApp
const NAME_COLORS = [
  "#53bdeb", "#e06055", "#d4813e", "#c1a835",
  "#6fba57", "#45bfa5", "#5bb5d4", "#a87bd4",
  "#e542a3", "#25d366", "#f27958", "#9c82e6"
];

function getNameColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

// Palet warna gradien inisial avatar
const GRADIENT_PALETTES = [
  ["#FF885E", "#FF516A"],
  ["#FFCD6A", "#FFA85C"],
  ["#E0A2F3", "#D669ED"],
  ["#A0DE7E", "#54CB68"],
  ["#53EDD6", "#28C9B7"],
  ["#72D5FD", "#2A9EF1"],
  ["#FFA8A8", "#FF719A"],
  ["#845EC2", "#D65DB1"],
  ["#4E8397", "#008B74"]
];

const PRESET_THEMES = {
  dark: { bg: "#202c33", text: "#e9edef", time: "#8696a0", quoteBg: "rgba(0, 0, 0, 0.25)", quoteText: "#8696a0" },
  light: { bg: "#ffffff", text: "#111b21", time: "#667781", quoteBg: "rgba(0, 0, 0, 0.06)", quoteText: "#667781" },
  night: { bg: "#111b21", text: "#ffffff", time: "#8696a0", quoteBg: "rgba(255, 255, 255, 0.08)", quoteText: "#8696a0" },
  blue: { bg: "#1e3a8a", text: "#ffffff", time: "#93c5fd", quoteBg: "rgba(0, 0, 0, 0.3)", quoteText: "#bfdbfe" },
  purple: { bg: "#4c1d95", text: "#ffffff", time: "#c4b5fd", quoteBg: "rgba(0, 0, 0, 0.3)", quoteText: "#ddd6fe" },
  pink: { bg: "#831843", text: "#ffffff", time: "#fbcfe8", quoteBg: "rgba(0, 0, 0, 0.3)", quoteText: "#fce7f3" },
  green: { bg: "#064e3b", text: "#ffffff", time: "#a7f3d0", quoteBg: "rgba(0, 0, 0, 0.3)", quoteText: "#d1fae5" },
  red: { bg: "#7f1d1d", text: "#ffffff", time: "#fecaca", quoteBg: "rgba(0, 0, 0, 0.3)", quoteText: "#fee2e2" }
};

const FONT_FAMILY = '"Segoe UI Emoji", "Noto Color Emoji", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default async ({ sock, msg, from, args, getMediaBuffer, downloadContentFromMessage }) => {
  if (!createCanvas || !sharp) {
    await sock.sendMessage(from, {
      text: "Fitur *.qc* memerlukan module *@napi-rs/canvas* dan *sharp*.",
    }, { quoted: msg });
    return;
  }

  const m = msg.message || {};
  const ext = m.extendedTextMessage;

  let displayName = "";
  let targetJid = "";
  let text = args.join(" ").trim();
  let quotedBox = null;
  let mediaImageBuffer = null;

  // Cek apakah ada opsi warna di awal argumen
  let theme = PRESET_THEMES.dark; // Default: Dark Mode WhatsApp
  if (args.length > 0) {
    const firstArg = args[0].toLowerCase();
    if (PRESET_THEMES[firstArg]) {
      theme = PRESET_THEMES[firstArg];
      text = args.slice(1).join(" ").trim();
    } else if (/^#[0-9a-f]{6}$/i.test(firstArg) || /^#[0-9a-f]{3}$/i.test(firstArg)) {
      const isLight = isColorLight(firstArg);
      theme = {
        bg: firstArg,
        text: isLight ? "#111b21" : "#ffffff",
        time: isLight ? "#667781" : "#8696a0",
        quoteBg: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.12)",
        quoteText: isLight ? "#667781" : "#8696a0"
      };
      text = args.slice(1).join(" ").trim();
    }
  }

  // ===== Tentukan Sumber Quote (Reply atau Langsung) =====
  let quotedContext = ext?.contextInfo?.quotedMessage ? ext.contextInfo : null;

  const botNumber = (sock.user?.id || "").split(":")[0];

  if (quotedContext) {
    targetJid = quotedContext.participant || quotedContext.remoteJid || "";
    const isBot = botNumber && targetJid.includes(botNumber);
    const contact = sock.contacts?.[targetJid];
    displayName = isBot ? "Abdbot" : (contact?.notify || contact?.name || contact?.pushName || formatPhoneNumber(targetJid) || "User");

    const qMsg = quotedContext.quotedMessage || {};

    // Jika pesan yang di-reply adalah media gambar
    if (qMsg.imageMessage && downloadContentFromMessage) {
      try {
        const stream = await downloadContentFromMessage(qMsg.imageMessage, "image");
        let buf = Buffer.from([]);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        if (buf.length > 0) mediaImageBuffer = buf;
      } catch (e) {}
    }

    // Ambil teks dari pesan yang di-reply jika user tidak mengetikkan teks sendiri
    const quotedText =
      qMsg.conversation ||
      qMsg.extendedTextMessage?.text ||
      qMsg.imageMessage?.caption ||
      qMsg.videoMessage?.caption ||
      "";

    if (!text) {
      text = quotedText;
    } else if (quotedText && text !== quotedText) {
      // Jika user mengetik teks baru sambil me-reply, jadikan quotedText sebagai kotak balasan di atas
      quotedBox = {
        name: displayName,
        text: quotedText.slice(0, 80) + (quotedText.length > 80 ? "..." : ""),
        color: getNameColor(displayName)
      };
      // Dan nama pengirim quote menjadi nama user yang memanggil command
      const myJid = msg.key?.participant || msg.key?.remoteJid || "";
      const myContact = sock.contacts?.[myJid];
      displayName = msg.pushName || myContact?.notify || formatPhoneNumber(myJid) || "User";
      targetJid = myJid;
    }

    // Jika pesan yang di-reply memiliki nested quote
    if (!quotedBox && qMsg.extendedTextMessage?.contextInfo?.quotedMessage) {
      const nestedContext = qMsg.extendedTextMessage.contextInfo;
      const nestedJid = nestedContext.participant || nestedContext.remoteJid || "";
      const nestedContact = sock.contacts?.[nestedJid];
      const nestedName = nestedContact?.notify || nestedContact?.name || formatPhoneNumber(nestedJid) || "User";
      const nestedText =
        nestedContext.quotedMessage?.conversation ||
        nestedContext.quotedMessage?.extendedTextMessage?.text ||
        nestedContext.quotedMessage?.imageMessage?.caption ||
        "";
      if (nestedText) {
        quotedBox = {
          name: nestedName,
          text: nestedText.slice(0, 80) + (nestedText.length > 80 ? "..." : ""),
          color: getNameColor(nestedName)
        };
      }
    }
  } else {
    // User mengetik langsung `.qc teks`
    targetJid = msg.key?.participant || msg.key?.remoteJid || "";
    const contact = sock.contacts?.[targetJid];
    displayName = msg.pushName || contact?.notify || formatPhoneNumber(targetJid) || "User";
  }

  if (!text && !mediaImageBuffer) {
    await sock.sendMessage(from, {
      text: "💬 *Format Penggunaan QC (Quote Creator)*:\n\n" +
            "• Ketik langsung: `.qc [teks]`\n" +
            "• Reply pesan: Balas pesan lalu ketik `.qc`\n" +
            "• Tema warna: `.qc light [teks]`, `.qc dark [teks]`, `.qc #1e3a8a [teks]`, `.qc purple [teks]`\n\n" +
            "_Contoh:_ `.qc Selamat malam semuanya!`"
    }, { quoted: msg });
    return;
  }

  try {
    // ===== 1. Ambil Foto Profil / Buat Avatar Inisial =====
    let avatarImg = null;
    try {
      if (targetJid && sock.profilePictureUrl) {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image");
        if (ppUrl) {
          const res = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 4000 });
          if (res.data) avatarImg = await loadImage(Buffer.from(res.data));
        }
      }
    } catch (e) {
      // Profil privat / tidak ada PP -> fallback ke avatar inisial
    }

    if (!avatarImg) {
      const avatarBuf = createInitialAvatar(displayName, 140);
      avatarImg = await loadImage(avatarBuf);
    }

    // ===== 2. Setup Pengukuran Canvas =====
    const AVATAR_SIZE = 64;
    const AVATAR_PAD = 14;
    const CANVAS_PAD = 24;
    const BUBBLE_PAD_H = 20;
    const BUBBLE_PAD_V = 16;
    const TAIL_W = 12;
    const RADIUS = 18;
    const MAX_TEXT_W = 480;

    const NAME_FONT_SIZE = 22;
    const TEXT_FONT_SIZE = 26;
    const LINE_HEIGHT = Math.round(TEXT_FONT_SIZE * 1.4);
    const TIME_FONT_SIZE = 17;

    const nameColor = getNameColor(displayName);

    // Hitung waktu saat ini (HH:MM)
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Measure temporary canvas
    const tempCanvas = createCanvas(1, 1);
    const tctx = tempCanvas.getContext("2d");

    tctx.font = `bold ${NAME_FONT_SIZE}px ${FONT_FAMILY}`;
    const nameWidth = tctx.measureText(displayName).width;

    // Word wrap & token formatting
    tctx.font = `${TEXT_FONT_SIZE}px ${FONT_FAMILY}`;
    const formattedLines = wrapFormattedText(tctx, text, MAX_TEXT_W, TEXT_FONT_SIZE);

    let maxContentWidth = Math.max(nameWidth, 120);
    for (const line of formattedLines) {
      if (line.width > maxContentWidth) maxContentWidth = line.width;
    }

    // Hitung ukuran Quoted Box jika ada
    let quotedBoxHeight = 0;
    let quotedBoxWidth = 0;
    if (quotedBox) {
      tctx.font = `bold 18px ${FONT_FAMILY}`;
      const qnWidth = tctx.measureText(quotedBox.name).width;
      tctx.font = `18px ${FONT_FAMILY}`;
      const qtWidth = tctx.measureText(quotedBox.text).width;
      quotedBoxWidth = Math.max(qnWidth, qtWidth) + 24;
      if (quotedBoxWidth > MAX_TEXT_W) quotedBoxWidth = MAX_TEXT_W;
      quotedBoxHeight = 48;
      if (quotedBoxWidth > maxContentWidth) maxContentWidth = quotedBoxWidth;
    }

    // Hitung ukuran Media Image jika ada
    let mediaImg = null;
    let mediaW = 0;
    let mediaH = 0;
    if (mediaImageBuffer) {
      try {
        mediaImg = await loadImage(mediaImageBuffer);
        const maxMediaDim = 320;
        const aspect = mediaImg.width / mediaImg.height;
        if (aspect >= 1) {
          mediaW = Math.min(mediaImg.width, maxMediaDim);
          mediaH = Math.round(mediaW / aspect);
        } else {
          mediaH = Math.min(mediaImg.height, maxMediaDim);
          mediaW = Math.round(mediaH * aspect);
        }
        if (mediaW > maxContentWidth) maxContentWidth = mediaW;
      } catch (e) {}
    }

    tctx.font = `${TIME_FONT_SIZE}px ${FONT_FAMILY}`;
    const timeWidth = tctx.measureText(`${timeStr}  ✓✓`).width + 10;

    // Dimensi Bubble
    const bubbleWidth = Math.max(maxContentWidth, timeWidth + 30) + BUBBLE_PAD_H * 2;
    let innerHeight = NAME_FONT_SIZE + 8;
    if (quotedBox) innerHeight += quotedBoxHeight + 10;
    if (mediaImg) innerHeight += mediaH + 12;
    innerHeight += formattedLines.length * LINE_HEIGHT + 18; // +18 untuk baris timestamp

    const bubbleHeight = innerHeight + BUBBLE_PAD_V * 2;

    const totalCanvasW = CANVAS_PAD * 2 + AVATAR_SIZE + AVATAR_PAD + TAIL_W + bubbleWidth;
    const totalCanvasH = CANVAS_PAD * 2 + Math.max(bubbleHeight, AVATAR_SIZE);

    // ===== 3. Rendering Canvas Utama =====
    const canvas = createCanvas(totalCanvasW, totalCanvasH);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, totalCanvasW, totalCanvasH);

    const avX = CANVAS_PAD;
    const avY = CANVAS_PAD;
    const bx = CANVAS_PAD + AVATAR_SIZE + AVATAR_PAD + TAIL_W;
    const by = CANVAS_PAD;

    // --- Render Avatar Bulat ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + AVATAR_SIZE / 2, avY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avX, avY, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();

    // --- Render Shadow Bubble ---
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = theme.bg;
    ctx.beginPath();
    ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, RADIUS);
    ctx.fill();
    ctx.restore();

    // --- Render Ekor Bubble (Tail menunjuk ke avatar) ---
    ctx.fillStyle = theme.bg;
    ctx.beginPath();
    ctx.moveTo(bx, by + 10);
    ctx.lineTo(bx - TAIL_W, by + 4);
    ctx.lineTo(bx, by + 26);
    ctx.closePath();
    ctx.fill();

    // Menghaluskan sambungan ekor dan body bubble
    ctx.fillRect(bx, by, RADIUS, 26);

    // --- Render Nama Pengirim ---
    let currentY = by + BUBBLE_PAD_V;
    ctx.fillStyle = nameColor;
    ctx.font = `bold ${NAME_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(displayName, bx + BUBBLE_PAD_H, currentY);

    currentY += NAME_FONT_SIZE + 8;

    // --- Render Quoted / Reply Box jika ada ---
    if (quotedBox) {
      const qx = bx + BUBBLE_PAD_H;
      const qy = currentY;
      const qw = Math.max(quotedBoxWidth, maxContentWidth);
      const qh = quotedBoxHeight;

      // Background quoted box
      ctx.fillStyle = theme.quoteBg;
      ctx.beginPath();
      ctx.roundRect(qx, qy, qw, qh, 8);
      ctx.fill();

      // Garis aksen kiri
      ctx.fillStyle = quotedBox.color;
      ctx.beginPath();
      ctx.roundRect(qx, qy, 5, qh, [8, 0, 0, 8]);
      ctx.fill();

      // Nama di quoted box
      ctx.fillStyle = quotedBox.color;
      ctx.font = `bold 16px ${FONT_FAMILY}`;
      ctx.fillText(quotedBox.name, qx + 14, qy + 6);

      // Teks di quoted box
      ctx.fillStyle = theme.quoteText;
      ctx.font = `15px ${FONT_FAMILY}`;
      ctx.fillText(quotedBox.text, qx + 14, qy + 26);

      currentY += qh + 10;
    }

    // --- Render Media Image jika ada ---
    if (mediaImg) {
      const mx = bx + BUBBLE_PAD_H;
      const my = currentY;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mx, my, mediaW, mediaH, 10);
      ctx.clip();
      ctx.drawImage(mediaImg, mx, my, mediaW, mediaH);
      ctx.restore();

      currentY += mediaH + 10;
    }

    // --- Render Teks Utama dengan Format Kaya (Bold, Italic, Strikethrough, Monospace) ---
    for (const line of formattedLines) {
      let curX = bx + BUBBLE_PAD_H;
      for (const token of line.tokens) {
        ctx.save();
        let fontStyle = "";
        let fontFamily = FONT_FAMILY;
        let textColor = theme.text;

        if (token.bold) fontStyle += "bold ";
        if (token.italic) fontStyle += "italic ";
        if (token.mono) {
          fontFamily = '"Courier New", Courier, monospace';
          textColor = isColorLight(theme.bg) ? "#0d9488" : "#2dd4bf";
        }
        if (token.mention) {
          textColor = "#53bdeb"; // Aksen biru mention WhatsApp
        }

        ctx.font = `${fontStyle}${TEXT_FONT_SIZE}px ${fontFamily}`;
        ctx.fillStyle = textColor;
        ctx.textBaseline = "top";
        ctx.fillText(token.text, curX, currentY);

        const tokenW = ctx.measureText(token.text).width;

        // Render Strikethrough jika aktif (~teks~)
        if (token.strike) {
          ctx.strokeStyle = textColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(curX, currentY + TEXT_FONT_SIZE / 2 + 1);
          ctx.lineTo(curX + tokenW, currentY + TEXT_FONT_SIZE / 2 + 1);
          ctx.stroke();
        }

        ctx.restore();
        curX += tokenW;
      }
      currentY += LINE_HEIGHT;
    }

    // --- Render Timestamp & Centang Biru (✓✓) ---
    const timeX = bx + bubbleWidth - BUBBLE_PAD_H;
    const timeY = by + bubbleHeight - BUBBLE_PAD_V - TIME_FONT_SIZE + 2;

    ctx.textAlign = "right";
    ctx.textBaseline = "top";

    // Double Blue Checkmarks
    ctx.font = `bold ${TIME_FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = "#53bdeb"; // Cyan WhatsApp checkmarks
    ctx.fillText("✓✓", timeX, timeY);

    const checkmarkW = ctx.measureText("✓✓").width + 5;

    // Jam (misal 21:45)
    ctx.font = `${TIME_FONT_SIZE - 2}px ${FONT_FAMILY}`;
    ctx.fillStyle = theme.time;
    ctx.fillText(timeStr, timeX - checkmarkW, timeY);

    // ===== 4. Export ke WebP Sticker dengan EXIF Metadata =====
    const pngBuffer = canvas.toBuffer("image/png");
    const rawWebp = await sharp(pngBuffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 95 })
      .toBuffer();

    const stickerBuffer = await addExifToWebpBuffer(rawWebp);
    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
  } catch (err) {
    console.error("❌ QC Error:", err);
    await sock.sendMessage(from, { text: `❌ Gagal membuat quote sticker: ${err.message}` }, { quoted: msg });
  }
};

// ==========================================
//  HELPER FUNCTIONS
// ==========================================

function createInitialAvatar(name, size = 140) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const cleanName = (name || "User").trim().toUpperCase();
  const words = cleanName.split(/\s+/).filter(Boolean);
  let initials = "U";
  if (words.length >= 2) {
    initials = words[0][0] + words[1][0];
  } else if (words.length === 1 && words[0].length >= 1) {
    initials = words[0].slice(0, 2);
  }

  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.font = `bold ${Math.round(size * 0.44)}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, size / 2, size / 2 + 2);

  return canvas.toBuffer("image/png");
}

function formatPhoneNumber(jid) {
  const num = (jid || "").split("@")[0].replace(/\D/g, "");
  if (!num || num.length < 8) return "User";
  if (num.startsWith("62")) {
    return `+62 ${num.slice(2, 5)}-${num.slice(5, 9)}-${num.slice(9)}`;
  }
  if (num.startsWith("1") && num.length === 11) {
    return `+1 (${num.slice(1, 4)}) ${num.slice(4, 7)}-${num.slice(7)}`;
  }
  return `+${num.slice(0, 3)} ${num.slice(3, 7)}-${num.slice(7)}`;
}

function isColorLight(color) {
  let hex = color.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150;
}

/**
 * Tokenize teks WhatsApp formatting: *bold*, _italic_, ~strike~, ```mono```, @mention
 */
function tokenizeFormattedText(text) {
  const regex = /(```[\s\S]*?```|\*[^*]+?\*|_[^_]+?_|~[^~]+?~|@\d{7,16}|[^\s*`_~@]+|\s+)/g;
  const matches = text.match(regex) || [text];
  const tokens = [];

  for (const m of matches) {
    if (m.startsWith("```") && m.endsWith("```") && m.length >= 6) {
      tokens.push({ text: m.slice(3, -3), mono: true });
    } else if (m.startsWith("*") && m.endsWith("*") && m.length >= 2) {
      tokens.push({ text: m.slice(1, -1), bold: true });
    } else if (m.startsWith("_") && m.endsWith("_") && m.length >= 2) {
      tokens.push({ text: m.slice(1, -1), italic: true });
    } else if (m.startsWith("~") && m.endsWith("~") && m.length >= 2) {
      tokens.push({ text: m.slice(1, -1), strike: true });
    } else if (m.startsWith("@") && /^@\d+$/.test(m)) {
      tokens.push({ text: m, mention: true });
    } else {
      tokens.push({ text: m });
    }
  }
  return tokens;
}

/**
 * Word wrap teks berformat
 */
function wrapFormattedText(ctx, rawText, maxWidth, fontSize) {
  const paragraphs = (rawText || "").split("\n");
  const lines = [];

  for (const p of paragraphs) {
    const tokens = tokenizeFormattedText(p);
    let currentLineTokens = [];
    let currentLineWidth = 0;

    for (const token of tokens) {
      ctx.save();
      let fontStyle = "";
      if (token.bold) fontStyle += "bold ";
      if (token.italic) fontStyle += "italic ";
      const fontFamily = token.mono ? '"Courier New", Courier, monospace' : FONT_FAMILY;
      ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
      const tokenWidth = ctx.measureText(token.text).width;
      ctx.restore();

      if (currentLineWidth + tokenWidth > maxWidth && currentLineTokens.length > 0 && token.text.trim() !== "") {
        lines.push({ tokens: currentLineTokens, width: currentLineWidth });
        currentLineTokens = [token];
        currentLineWidth = tokenWidth;
      } else {
        currentLineTokens.push(token);
        currentLineWidth += tokenWidth;
      }
    }

    if (currentLineTokens.length > 0) {
      lines.push({ tokens: currentLineTokens, width: currentLineWidth });
    }
  }

  return lines.length > 0 ? lines : [{ tokens: [{ text: "" }], width: 0 }];
}
