// utils.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

function tmp(ext = "") {
  const dir = path.join(os.tmpdir(), "abd-bot");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return path.join(dir, ext ? `${name}.${ext}` : name);
}

// ambil buffer media (image / video / sticker, termasuk yang di-reply)
async function getMediaBuffer(sock, msg) {
  const m = msg.message || {};
  let type = Object.keys(m)[0];
  let content = m[type];

  // kalau pesan teks yang mereply media
  if (type === "extendedTextMessage" && content?.contextInfo?.quotedMessage) {
    const qm = content.contextInfo.quotedMessage;
    const qType = Object.keys(qm)[0];
    type = qType;
    content = qm[qType];
  }

  const mediaTypes = ["imageMessage", "videoMessage", "stickerMessage"];

  if (!mediaTypes.includes(type)) return null;

  const stream = await downloadContentFromMessage(
    content,
    type.replace("Message", "")
  );

  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }

  return { buffer, type };
}

module.exports = { tmp, getMediaBuffer };
