// commands/qc.js — Quote Creator: bikin stiker balon chat WhatsApp dari pesan yang di-reply
import { createRequire } from "module";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { addExifToWebpBuffer } from "../utils/exif.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas"));
  if (GlobalFonts) {
    const fontsDir = path.join(__dirname, "..", "assets", "fonts");
    for (const [file, family] of [
      ["Noto-Regular.ttf", "NotoSans"],
      ["Noto-Bold.ttf", "NotoSansBold"],
      ["Noto-Emoji.ttf", "NotoEmoji"],
    ]) {
      const p = path.join(fontsDir, file);
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family);
    }
  }
} catch (e) {
  createCanvas = null;
  loadImage = null;
}

let sharp;
try { sharp = require("sharp"); } catch { sharp = null; }

// ===== Konstanta Warna =====
const NAME_COLORS = [
  "#53bdeb", "#e06055", "#d4813e", "#c1a835",
  "#6fba57", "#45bfa5", "#5bb5d4", "#a87bd4",
  "#e542a3", "#25d366", "#f27958", "#9c82e6"
];

const GRADIENT_PALETTES = [
  ["#FF885E", "#FF516A"], ["#FFCD6A", "#FFA85C"],
  ["#E0A2F3", "#D669ED"], ["#A0DE7E", "#54CB68"],
  ["#53EDD6", "#28C9B7"], ["#72D5FD", "#2A9EF1"],
  ["#FFA8A8", "#FF719A"], ["#845EC2", "#D65DB1"],
];

const THEMES = {
  dark:   { bg: "#202c33", text: "#e9edef", time: "#8696a0", qBg: "rgba(0,0,0,0.25)", qTx: "#8696a0" },
  light:  { bg: "#ffffff", text: "#111b21", time: "#667781", qBg: "rgba(0,0,0,0.06)", qTx: "#667781" },
  night:  { bg: "#111b21", text: "#ffffff", time: "#8696a0", qBg: "rgba(255,255,255,0.08)", qTx: "#8696a0" },
  blue:   { bg: "#1e3a8a", text: "#ffffff", time: "#93c5fd", qBg: "rgba(0,0,0,0.3)", qTx: "#bfdbfe" },
  purple: { bg: "#4c1d95", text: "#ffffff", time: "#c4b5fd", qBg: "rgba(0,0,0,0.3)", qTx: "#ddd6fe" },
  pink:   { bg: "#831843", text: "#ffffff", time: "#fbcfe8", qBg: "rgba(0,0,0,0.3)", qTx: "#fce7f3" },
  green:  { bg: "#064e3b", text: "#ffffff", time: "#a7f3d0", qBg: "rgba(0,0,0,0.3)", qTx: "#d1fae5" },
  red:    { bg: "#7f1d1d", text: "#ffffff", time: "#fecaca", qBg: "rgba(0,0,0,0.3)", qTx: "#fee2e2" },
};

const FONT = '"NotoSans", "NotoSansBold", "NotoEmoji", "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif';

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}
function nameColor(n) { return NAME_COLORS[hashStr(n) % NAME_COLORS.length]; }

function isLight(hex) {
  let h = (hex || "").replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.substr(0,2),16)||0, g = parseInt(h.substr(2,2),16)||0, b = parseInt(h.substr(4,2),16)||0;
  return (r*299+g*587+b*114)/1000 > 150;
}

function fmtPhone(jid) {
  const n = (jid||"").split("@")[0].replace(/\D/g,"");
  if (!n || n.length < 8) return "User";
  if (n.startsWith("62")) return `+62 ${n.slice(2,5)}-${n.slice(5,9)}-${n.slice(9)}`;
  return `+${n.slice(0,3)} ${n.slice(3,7)}-${n.slice(7)}`;
}

// ===== Cari contextInfo dari message apapun =====
function getContextInfo(msg) {
  const m = msg.message || {};
  // extendedTextMessage (reply teks)
  if (m.extendedTextMessage?.contextInfo?.quotedMessage) return m.extendedTextMessage.contextInfo;
  // imageMessage (reply gambar dengan caption)
  if (m.imageMessage?.contextInfo?.quotedMessage) return m.imageMessage.contextInfo;
  // videoMessage
  if (m.videoMessage?.contextInfo?.quotedMessage) return m.videoMessage.contextInfo;
  // stickerMessage (reply stiker)
  if (m.stickerMessage?.contextInfo?.quotedMessage) return m.stickerMessage.contextInfo;
  // buttonsResponseMessage, listResponseMessage, dll
  for (const key of Object.keys(m)) {
    if (m[key]?.contextInfo?.quotedMessage) return m[key].contextInfo;
  }
  return null;
}

// ===== Handler Utama =====
export default async ({ sock, msg, from, args, downloadContentFromMessage }) => {
  if (!createCanvas || !sharp) {
    return sock.sendMessage(from, { text: "⚠️ Fitur .qc memerlukan @napi-rs/canvas dan sharp." }, { quoted: msg });
  }

  // --- 1. Parse tema warna dari args ---
  let theme = THEMES.dark;
  let textArgs = [...args];
  if (textArgs.length > 0) {
    const first = textArgs[0].toLowerCase();
    if (THEMES[first]) {
      theme = THEMES[first];
      textArgs = textArgs.slice(1);
    } else if (/^#[0-9a-f]{3,6}$/i.test(first)) {
      const light = isLight(first);
      theme = { bg: first, text: light?"#111b21":"#fff", time: light?"#667781":"#8696a0", qBg: light?"rgba(0,0,0,0.06)":"rgba(255,255,255,0.12)", qTx: light?"#667781":"#8696a0" };
      textArgs = textArgs.slice(1);
    }
  }
  let userText = textArgs.join(" ").trim();

  // --- 2. Deteksi reply / contextInfo ---
  const ci = getContextInfo(msg);
  const botNum = (sock.user?.id || "").split(":")[0];

  let displayName = "";
  let targetJid = "";
  let quotedBox = null;

  if (ci) {
    // Ada reply — ambil info pengirim pesan yang di-reply
    targetJid = ci.participant || ci.remoteJid || "";
    const isBotMsg = botNum && targetJid.includes(botNum);
    const contact = sock.contacts?.[targetJid];
    displayName = isBotMsg ? "Abdbot" : (contact?.notify || contact?.name || contact?.pushName || fmtPhone(targetJid));

    const qMsg = ci.quotedMessage || {};
    const quotedText =
      qMsg.conversation ||
      qMsg.extendedTextMessage?.text ||
      qMsg.imageMessage?.caption ||
      qMsg.videoMessage?.caption || "";

    if (!userText) {
      // User cuma ketik .qc tanpa teks -> ambil teks pesan yang di-reply
      userText = quotedText;
    } else if (quotedText) {
      // User ketik .qc [teks baru] sambil reply -> tampilkan reply box di atas
      quotedBox = {
        name: displayName,
        text: quotedText.length > 80 ? quotedText.slice(0, 77) + "..." : quotedText,
        color: nameColor(displayName)
      };
      // Ganti pengirim ke user yang memanggil command
      const myJid = msg.key?.participant || msg.key?.remoteJid || "";
      const myContact = sock.contacts?.[myJid];
      displayName = msg.pushName || myContact?.notify || fmtPhone(myJid);
      targetJid = myJid;
    }
  } else {
    // Tidak reply — user langsung ketik .qc [teks]
    targetJid = msg.key?.participant || msg.key?.remoteJid || "";
    const contact = sock.contacts?.[targetJid];
    displayName = msg.pushName || contact?.notify || fmtPhone(targetJid);
  }

  if (!userText) {
    return sock.sendMessage(from, {
      text: "💬 *Quote Creator (QC)*\n\n" +
        "• Reply pesan seseorang lalu ketik `.qc`\n" +
        "• Atau ketik langsung: `.qc [teks]`\n" +
        "• Tema: `.qc dark`, `.qc light`, `.qc purple`, `.qc #hex`\n\n" +
        "_Contoh: reply pesan teman → ketik .qc_"
    }, { quoted: msg });
  }

  try {
    // --- 3. Ambil avatar (foto profil / fallback inisial) ---
    let avatarImg = null;
    try {
      if (targetJid) {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image");
        if (ppUrl) {
          const res = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 4000 });
          avatarImg = await loadImage(Buffer.from(res.data));
        }
      }
    } catch {}
    if (!avatarImg) avatarImg = await loadImage(makeInitialAvatar(displayName));

    // --- 4. Ukur dimensi bubble ---
    const AV = 64, AV_PAD = 14, PAD = 24, BPH = 20, BPV = 16, TAIL = 12, R = 18, MAX_W = 480;
    const NAME_FS = 22, TEXT_FS = 26, LH = Math.round(TEXT_FS * 1.4), TIME_FS = 17;

    const nc = nameColor(displayName);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    const mc = createCanvas(1, 1);
    const mctx = mc.getContext("2d");

    mctx.font = `bold ${NAME_FS}px ${FONT}`;
    const nameW = mctx.measureText(displayName).width;

    mctx.font = `${TEXT_FS}px ${FONT}`;
    const lines = wrapText(mctx, userText, MAX_W, TEXT_FS);
    let contentW = Math.max(nameW, 120);
    for (const l of lines) if (l.w > contentW) contentW = l.w;

    let qbH = 0;
    if (quotedBox) {
      mctx.font = `bold 18px ${FONT}`;
      const qnW = mctx.measureText(quotedBox.name).width;
      mctx.font = `18px ${FONT}`;
      const qtW = mctx.measureText(quotedBox.text).width;
      const qw = Math.min(Math.max(qnW, qtW) + 24, MAX_W);
      if (qw > contentW) contentW = qw;
      qbH = 48;
    }

    mctx.font = `${TIME_FS}px ${FONT}`;
    const timeW = mctx.measureText(`${timeStr}  ✓✓`).width + 10;

    const bubW = Math.max(contentW, timeW + 30) + BPH * 2;
    let innerH = NAME_FS + 8 + (qbH ? qbH + 10 : 0) + lines.length * LH + 18;
    const bubH = innerH + BPV * 2;

    const cW = PAD*2 + AV + AV_PAD + TAIL + bubW;
    const cH = PAD*2 + Math.max(bubH, AV);

    // --- 5. Render canvas ---
    const canvas = createCanvas(cW, cH);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cW, cH);

    const ax = PAD, ay = PAD;
    const bx = PAD + AV + AV_PAD + TAIL, by = PAD;

    // Avatar bulat
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + AV/2, ay + AV/2, AV/2, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(avatarImg, ax, ay, AV, AV);
    ctx.restore();

    // Bayangan bubble
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = theme.bg;
    ctx.beginPath();
    ctx.roundRect(bx, by, bubW, bubH, R);
    ctx.fill();
    ctx.restore();

    // Ekor bubble
    ctx.fillStyle = theme.bg;
    ctx.beginPath();
    ctx.moveTo(bx, by+10);
    ctx.lineTo(bx-TAIL, by+4);
    ctx.lineTo(bx, by+26);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(bx, by, R, 26);

    // Nama pengirim
    let cy = by + BPV;
    ctx.fillStyle = nc;
    ctx.font = `bold ${NAME_FS}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(displayName, bx + BPH, cy);
    cy += NAME_FS + 8;

    // Quoted reply box
    if (quotedBox) {
      const qx = bx + BPH;
      const qw = Math.max(contentW, 100);
      ctx.fillStyle = theme.qBg;
      ctx.beginPath(); ctx.roundRect(qx, cy, qw, qbH, 8); ctx.fill();
      ctx.fillStyle = quotedBox.color;
      ctx.beginPath(); ctx.roundRect(qx, cy, 5, qbH, [8,0,0,8]); ctx.fill();
      ctx.fillStyle = quotedBox.color;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(quotedBox.name, qx+14, cy+6);
      ctx.fillStyle = theme.qTx;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(quotedBox.text, qx+14, cy+26);
      cy += qbH + 10;
    }

    // Teks utama (dengan formatting)
    for (const line of lines) {
      let lx = bx + BPH;
      for (const tk of line.tokens) {
        ctx.save();
        let fs = "", ff = FONT, tc = theme.text;
        if (tk.bold) fs += "bold ";
        if (tk.italic) fs += "italic ";
        if (tk.mono) { ff = '"Courier New", monospace'; tc = isLight(theme.bg) ? "#0d9488" : "#2dd4bf"; }
        if (tk.mention) tc = "#53bdeb";
        ctx.font = `${fs}${TEXT_FS}px ${ff}`;
        ctx.fillStyle = tc;
        ctx.textBaseline = "top";
        ctx.fillText(tk.text, lx, cy);
        const tw = ctx.measureText(tk.text).width;
        if (tk.strike) {
          ctx.strokeStyle = tc; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(lx, cy+TEXT_FS/2+1); ctx.lineTo(lx+tw, cy+TEXT_FS/2+1); ctx.stroke();
        }
        ctx.restore();
        lx += tw;
      }
      cy += LH;
    }

    // Timestamp + centang biru
    const tx = bx + bubW - BPH;
    const ty = by + bubH - BPV - TIME_FS + 2;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.font = `bold ${TIME_FS}px ${FONT}`;
    ctx.fillStyle = "#53bdeb";
    ctx.fillText("✓✓", tx, ty);
    const ckW = ctx.measureText("✓✓").width + 5;
    ctx.font = `${TIME_FS-2}px ${FONT}`;
    ctx.fillStyle = theme.time;
    ctx.fillText(timeStr, tx - ckW, ty);

    // --- 6. Export ke stiker WebP ---
    const png = canvas.toBuffer("image/png");
    const webp = await sharp(png)
      .resize(512, 512, { fit: "contain", background: { r:0, g:0, b:0, alpha:0 } })
      .webp({ quality: 95 })
      .toBuffer();
    const sticker = await addExifToWebpBuffer(webp);
    await sock.sendMessage(from, { sticker }, { quoted: msg });
  } catch (err) {
    console.error("❌ QC Error:", err);
    await sock.sendMessage(from, { text: `❌ QC gagal: ${err.message}` }, { quoted: msg });
  }
};

// ===== Helper Functions =====

function makeInitialAvatar(name, size = 140) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const clean = (name || "User").trim().toUpperCase();
  const words = clean.split(/\s+/).filter(Boolean);
  const initials = words.length >= 2 ? words[0][0] + words[1][0] : clean.slice(0, 2) || "U";
  const colors = GRADIENT_PALETTES[hashStr(clean) % GRADIENT_PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill();
  ctx.font = `bold ${Math.round(size*0.44)}px ${FONT}`;
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(initials, size/2, size/2+2);
  return canvas.toBuffer("image/png");
}

function tokenize(text) {
  const rx = /(```[\s\S]*?```|\*[^*]+?\*|_[^_]+?_|~[^~]+?~|@\d{7,16}|[^\s*`_~@]+|\s+)/g;
  const matches = text.match(rx) || [text];
  return matches.map(m => {
    if (m.startsWith("```") && m.endsWith("```") && m.length >= 6) return { text: m.slice(3,-3), mono: true };
    if (m.startsWith("*") && m.endsWith("*") && m.length >= 2) return { text: m.slice(1,-1), bold: true };
    if (m.startsWith("_") && m.endsWith("_") && m.length >= 2) return { text: m.slice(1,-1), italic: true };
    if (m.startsWith("~") && m.endsWith("~") && m.length >= 2) return { text: m.slice(1,-1), strike: true };
    if (/^@\d+$/.test(m)) return { text: m, mention: true };
    return { text: m };
  });
}

function wrapText(ctx, raw, maxW, fontSize) {
  const paras = (raw || "").split("\n");
  const result = [];
  for (const p of paras) {
    const tokens = tokenize(p);
    let curTokens = [], curW = 0;
    for (const tk of tokens) {
      ctx.save();
      let fs = "";
      if (tk.bold) fs += "bold ";
      if (tk.italic) fs += "italic ";
      const ff = tk.mono ? '"Courier New", monospace' : FONT;
      ctx.font = `${fs}${fontSize}px ${ff}`;
      const tw = ctx.measureText(tk.text).width;
      ctx.restore();
      if (curW + tw > maxW && curTokens.length > 0 && tk.text.trim()) {
        result.push({ tokens: curTokens, w: curW });
        curTokens = [tk]; curW = tw;
      } else {
        curTokens.push(tk); curW += tw;
      }
    }
    if (curTokens.length > 0) result.push({ tokens: curTokens, w: curW });
  }
  return result.length > 0 ? result : [{ tokens: [{ text: "" }], w: 0 }];
}
