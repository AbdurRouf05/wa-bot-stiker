import fs from "fs";
import path from "path";
import os from "os";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";

export function tmp(ext = "") {
  const dir = path.join(os.tmpdir(), "abd-bot");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return path.join(dir, ext ? `${name}.${ext}` : name);
}

// ambil buffer media (image / video / sticker, termasuk yang di-reply)
export async function getMediaBuffer(sock, msg) {
  const m = msg.message || {};
  let type = Object.keys(m).find(k => k.endsWith('Message'));
  let content = m[type];

  // kalau pesan teks yang mereply media
  if ((type === "extendedTextMessage" || !type) && m.extendedTextMessage?.contextInfo?.quotedMessage) {
    const qm = m.extendedTextMessage.contextInfo.quotedMessage;
    const qType = Object.keys(qm).find(k => k.endsWith('Message'));
    if (qType) {
        type = qType;
        content = qm[qType];
    }
  }

  const mediaTypes = ["imageMessage", "videoMessage", "stickerMessage", "audioMessage"];
  if (!type || !mediaTypes.includes(type)) return null;

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
