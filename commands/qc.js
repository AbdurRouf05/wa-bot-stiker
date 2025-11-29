let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require("canvas"));
} catch (e) {
  createCanvas = null;
  loadImage = null;
}

const sharp = require("sharp");
const fetch = (...a) => import("node-fetch").then(({ default: f }) => f(...a));

/**
 * .qc
 * - .qc teks
 * - reply pesan lalu kirim .qc
 */
module.exports = async ({ sock, msg, from, args, getMediaBuffer }) => {
  if (!createCanvas || !loadImage) {
    await sock.sendMessage(
      from,
      { text: "Fitur .qc belum tersedia di Termux/Android (module canvas tidak terpasang)." },
      { quoted: msg }
    );
    return;
  }

let text = (args || []).join(" ").trim();
  let targetJid;
  let isReply = false;

  // ========== CEK REPLY / TIDAK ==========
  const quoted = ctxInfo.quotedMessage;
  if (quoted) {
    isReply = true;

    const qType = Object.keys(quoted)[0]; // misal: "conversation" / "extendedTextMessage"
    const qm = quoted[qType] || {};

    // Di banyak kasus extendedTextMessage teks-nya ada di qm.text
    const qText =
      qm.text || // extendedTextMessage.text
      qm.conversation || // conversation
      qm.extendedTextMessage?.text || // fallback lain
      qm.imageMessage?.caption ||
      qm.videoMessage?.caption ||
      "";

    if (!text) text = (qText || "").trim();

    // JID pemilik pesan yang di-reply
    targetJid =
      ctxInfo.participant || // pengirim pesan yang di-reply (di grup)
      msg.key.participant || // fallback
      msg.key.remoteJid;
  } else {
    // bukan reply → pakai pengirim pesan ini
    targetJid = msg.key.participant || msg.key.remoteJid;
  }

  if (!text) {
    await sock.sendMessage(
      from,
      { text: "Kirim *.qc teks* atau reply pesan dengan *.qc*." },
      { quoted: msg }
    );
    return;
  }

  // ========== AMBIL NICKNAME ==========
  const justNumber = (jid) => (jid || "").split("@")[0];

  let displayName = "";

  if (!isReply && msg.pushName) {
    displayName = msg.pushName;
  }

  const contact = sock.contacts?.[targetJid];
  if (contact) {
    displayName =
      displayName ||
      contact.name ||
      contact.notify ||
      contact.verifiedName ||
      contact.pushname ||
      "";
  }

  if (!displayName) displayName = justNumber(targetJid);

  console.log(`[QC] name="${displayName}" | jid=${targetJid}`);

  // ========== PENGATURAN BUBBLE ==========
  const AVATAR_SIZE = 72;
  const AVATAR_MARGIN = 10;
  const OUTER_MARGIN = 10;
  const BUBBLE_PADDING_X = 20;
  const BUBBLE_PADDING_Y = 16;
  const MAX_BUBBLE_WIDTH = 380;
  const LINE_HEIGHT = 24;
  const NAME_HEIGHT = 22;

  // canvas sementara untuk ukur teks
  const tmpCanvas = createCanvas(1, 1);
  const tmpCtx = tmpCanvas.getContext("2d");
  tmpCtx.font = "16px Segoe UI";

  const nameWidth = tmpCtx.measureText(displayName).width;

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    const w = tmpCtx.measureText(testLine).width;

    if (w > MAX_BUBBLE_WIDTH && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const textLinesWidth =
    lines.length > 0
      ? Math.max(...lines.map((ln) => tmpCtx.measureText(ln).width))
      : 0;

  const contentWidth = Math.max(nameWidth, textLinesWidth);
  const bubbleWidth =
    Math.min(MAX_BUBBLE_WIDTH, contentWidth) + BUBBLE_PADDING_X * 2;
  const bubbleHeight =
    lines.length * LINE_HEIGHT +
    BUBBLE_PADDING_Y * 2 +
    (displayName ? NAME_HEIGHT : 0);

  const contentHeight = Math.max(AVATAR_SIZE, bubbleHeight);

  // ukuran canvas PAS dengan konten → stiker kelihatan penuh
  const canvasWidth =
    OUTER_MARGIN * 2 + AVATAR_SIZE + AVATAR_MARGIN + bubbleWidth;
  const canvasHeight = OUTER_MARGIN * 2 + contentHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // ========== AMBIL FOTO PROFIL ==========
  let avatarImg = null;
  try {
    const avatarJid =
      (isReply && ctxInfo.participant) ||
      (targetJid.endsWith("@g.us") ? ctxInfo.participant : targetJid);

    if (avatarJid) {
      const url = await sock.profilePictureUrl(avatarJid, "image");
      if (url) {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        avatarImg = await loadImage(buf);
      }
    }
  } catch (e) {
    console.log("[QC] gagal ambil avatar:", e?.message || e);
  }

  // ========== POSISI ==========
  const avatarX = OUTER_MARGIN + AVATAR_SIZE / 2;
  const avatarY = OUTER_MARGIN + contentHeight / 2;

  const bubbleX = OUTER_MARGIN + AVATAR_SIZE + AVATAR_MARGIN;
  const bubbleY = OUTER_MARGIN;
  const radius = 14;

  // ========== GAMBAR AVATAR ==========
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      avatarImg,
      avatarX - AVATAR_SIZE / 2,
      avatarY - AVATAR_SIZE / 2,
      AVATAR_SIZE,
      AVATAR_SIZE
    );
    ctx.restore();
  }

  // ========== GAMBAR BUBBLE ==========
  ctx.fillStyle = "#005c4b";
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY,
    bubbleX + bubbleWidth,
    bubbleY + radius
  );
  ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY + bubbleHeight,
    bubbleX + bubbleWidth - radius,
    bubbleY + bubbleHeight
  );
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
  ctx.quadraticCurveTo(
    bubbleX,
    bubbleY + bubbleHeight,
    bubbleX,
    bubbleY + bubbleHeight - radius
  );
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
  ctx.closePath();
  ctx.fill();

  // ========== TEKS NAMA ==========
  if (displayName) {
    ctx.fillStyle = "#53bdeb";
    ctx.font = "bold 15px Segoe UI";
    ctx.fillText(displayName, bubbleX + BUBBLE_PADDING_X, bubbleY + 20);
  }

  // ========== TEKS PESAN ==========
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px Segoe UI";
  let textY = bubbleY + (displayName ? 40 : 22);

  for (const line of lines) {
    ctx.fillText(line, bubbleX + BUBBLE_PADDING_X, textY);
    textY += LINE_HEIGHT;
  }

  // ========== KONVERSI KE STIKER ==========
  const pngBuf = canvas.toBuffer("image/png");
  const webpBuf = await sharp(pngBuf).webp({ quality: 95 }).toBuffer();

  await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
};
