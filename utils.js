import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";

export function tmp(ext = "") {
  const dir = path.join(os.tmpdir(), "abd-bot");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return path.join(dir, ext ? `${name}.${ext}` : name);
}

export function cleanup(...files) {
  for (const f of files) {
    if (f) fs.rm(f, { force: true, recursive: true }, () => {});
  }
}

/** Jalankan program eksternal (ffmpeg, soffice, python) dan tunggu selesai. */
export function run(cmd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message).trim().split("\n").slice(-3).join(" | ");
        return reject(new Error(`${path.basename(cmd)} gagal: ${detail}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

// Pembungkus yang dipakai WhatsApp: sekali lihat, pesan sementara, dokumen ber-caption, dll.
const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "groupMentionedMessage",
  "botInvokeMessage",
];

/** Kupas semua pembungkus sampai ke isi pesan yang sebenarnya. */
export function unwrapMessage(message) {
  let m = message || {};
  for (let i = 0; i < 6; i++) {
    const key = WRAPPERS.find((k) => m[k]?.message);
    if (!key) break;
    m = m[key].message;
  }
  return m;
}

/** Ambil teks/caption dari pesan apa pun (termasuk foto sekali lihat & dokumen). */
export function getMessageText(message) {
  const m = unwrapMessage(message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

/** contextInfo (info reply) dari tipe pesan apa pun. */
export function getContextInfo(message) {
  const m = unwrapMessage(message);
  for (const key of Object.keys(m)) {
    if (m[key]?.contextInfo) return m[key].contextInfo;
  }
  return null;
}

const MEDIA_TYPES = ["imageMessage", "videoMessage", "stickerMessage", "audioMessage", "documentMessage"];

function findMedia(message) {
  const m = unwrapMessage(message);
  const type = MEDIA_TYPES.find((t) => m[t]);
  return type ? { type, content: m[type] } : null;
}

// ===== Cache pesan media terbaru =====
// Saat user me-reply foto sekali lihat, WhatsApp kadang mengirim quotedMessage tanpa
// kunci media. Pesan aslinya (yang diterima bot) masih punya kuncinya, jadi kita simpan.
const MEDIA_CACHE_MAX = 500;
const mediaCache = new Map();

export function rememberMedia(msg) {
  const id = msg?.key?.id;
  if (!id || !findMedia(msg.message)) return;
  mediaCache.set(id, msg.message);
  if (mediaCache.size > MEDIA_CACHE_MAX) {
    mediaCache.delete(mediaCache.keys().next().value);
  }
}

async function download(content, type) {
  const stream = await downloadContentFromMessage(content, type.replace("Message", ""));
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const hasMediaKey = (c) => Boolean(c?.mediaKey && (c.directPath || c.url));

/**
 * Ambil buffer media dari pesan itu sendiri (caption) atau dari pesan yang di-reply.
 * Mendukung foto/video sekali lihat, pesan sementara (disappearing), dan dokumen.
 * Return: { buffer, type, mimetype, fileName, seconds, isViewOnce } atau null.
 */
export async function getMediaBuffer(sock, msg) {
  const own = findMedia(msg.message);
  let target = own;
  let cachedId = null;

  if (!target) {
    const ctx = getContextInfo(msg.message);
    if (ctx?.quotedMessage) {
      target = findMedia(ctx.quotedMessage);
      cachedId = ctx.stanzaId;
      // Quoted tanpa kunci media (umum pada sekali lihat) → pakai salinan dari cache
      const cached = cachedId && mediaCache.get(cachedId);
      if (cached && (!target || !hasMediaKey(target.content))) {
        target = findMedia(cached);
      }
    }
  }

  if (!target) return null;

  let buffer;
  try {
    buffer = await download(target.content, target.type);
  } catch (err) {
    const cached = cachedId && mediaCache.get(cachedId);
    const alt = cached && findMedia(cached);
    if (!alt || alt.content === target.content) throw err;
    buffer = await download(alt.content, alt.type);
    target = alt;
  }

  const c = target.content;
  return {
    buffer,
    type: target.type,
    mimetype: c.mimetype || "",
    fileName: c.fileName || "",
    seconds: c.seconds || 0,
    isViewOnce: Boolean(c.viewOnce),
  };
}

/** Jenis media sederhana: "image" | "video" | "sticker" | "audio" | "document" */
export function mediaKind(media) {
  if (!media) return null;
  if (media.type === "documentMessage") {
    if (media.mimetype.startsWith("image/")) return "image";
    if (media.mimetype.startsWith("video/")) return "video";
    return "document";
  }
  return media.type.replace("Message", "");
}
