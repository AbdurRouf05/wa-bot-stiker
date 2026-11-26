// utils/soundSticker.js — Kirim "stiker bersuara" WhatsApp (stiker animasi + audio Opus).
//
// Baileys belum mengenal format ini. Di protokol WhatsApp bentuknya:
//   Message.134 (audioStickerMessage: FutureProofMessage)
//     └ 1 message: Message
//         └ 26 stickerMessage: StickerMessage
//             ├ (field stiker biasa: url, mediaKey, isAnimated, ...)
//             ├ 24 premium (0), 25 emojis
//             └ 26 audioMessage: AudioMessage (audio/ogg; codecs=opus)
// Kita menyusun byte-nya sendiri lalu "menyelipkan" ke encoder proto.Message, tanpa mengubah
// node_modules. stickerMessage tetap ada di objek supaya Baileys menandai stanza sebagai
// mediatype="sticker", tetapi tidak ikut di-encode (yang dikirim hanya versi bersuara).
// Diadaptasi dari coelhobugado/whatsapp-figurinhas-com-som (MIT).
import crypto from "crypto";
import {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  getMediaKeys,
} from "@whiskeysockets/baileys";

const MARK = Symbol.for("abdbot.soundSticker");
const FIELD_AUDIO_STICKER = 134;
const FIELD_FUTURE_PROOF_MESSAGE = 1;
const FIELD_STICKER = 26;
const FIELD_STICKER_PREMIUM = 24;
const FIELD_STICKER_EMOJIS = 25;
const FIELD_STICKER_AUDIO = 26;
const SIDECAR_CHUNK = 64 * 1024;

function varint(value) {
  const bytes = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}

const lengthField = (field, payload) =>
  Buffer.concat([varint(field * 8 + 2), varint(payload.length), payload]);
const varintField = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);

/** Byte FutureProofMessage untuk field 134. */
export function buildSoundStickerWrapper(sticker, audio, emojis = "🔊") {
  const stickerBytes = Buffer.concat([
    Buffer.from(proto.Message.StickerMessage.encode(sticker).finish()),
    varintField(FIELD_STICKER_PREMIUM, 0),
    lengthField(FIELD_STICKER_EMOJIS, Buffer.from(emojis, "utf-8")),
    lengthField(FIELD_STICKER_AUDIO, Buffer.from(proto.Message.AudioMessage.encode(audio).finish())),
  ]);
  return lengthField(FIELD_FUTURE_PROOF_MESSAGE, lengthField(FIELD_STICKER, stickerBytes));
}

let encoderInstalled = false;
export function installSoundStickerEncoder() {
  if (encoderInstalled) return;
  const original = proto.Message.encode;
  proto.Message.encode = function encode(message, writer) {
    const wrapper = message?.[MARK];
    if (!wrapper) return original.call(proto.Message, message, writer);
    const { stickerMessage: _visibleOnlyToBaileys, ...rest } = message;
    const out = original.call(proto.Message, rest, writer);
    out.uint32(FIELD_AUDIO_STICKER * 8 + 2).bytes(wrapper);
    return out;
  };
  encoderInstalled = true;
}

/** HMAC per 64 KiB dari audio terenkripsi — dipakai WhatsApp untuk streaming audio. */
async function createStreamingSidecar(audio, mediaKey, fileEncSha256) {
  const { iv, cipherKey, macKey } = await getMediaKeys(Buffer.from(mediaKey), "audio");
  const cipher = crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(audio), cipher.final()]);
  const mac = crypto.createHmac("sha256", macKey).update(iv).update(encrypted).digest().subarray(0, 10);
  const hash = crypto.createHash("sha256").update(encrypted).update(mac).digest();
  if (!hash.equals(Buffer.from(fileEncSha256))) return null; // tidak cocok → lewati sidecar
  const parts = [];
  for (let start = 0; start < encrypted.length; start += SIDECAR_CHUNK) {
    const previous = start === 0 ? iv : encrypted.subarray(start - 16, start);
    const chunk = encrypted.subarray(start, start + SIDECAR_CHUNK);
    parts.push(crypto.createHmac("sha256", macKey).update(previous).update(chunk).digest().subarray(0, 10));
  }
  return Buffer.concat(parts);
}

/**
 * Upload WebP animasi + audio Opus lalu kirim sebagai stiker bersuara.
 * @param {object} p { webp: Buffer, audio: Buffer, seconds: number, quoted?: WAMessage, emojis?: string }
 */
export async function sendSoundSticker(sock, jid, { webp, audio, seconds, quoted, emojis = "🔊" }) {
  if (!sock.user?.id) throw new Error("Socket belum terautentikasi.");
  installSoundStickerEncoder();

  const opts = { upload: sock.waUploadToServer, mediaUploadTimeoutMs: 60_000, jid };
  const visual = await prepareWAMessageMedia({ sticker: webp }, opts);
  const sound = await prepareWAMessageMedia(
    { audio, mimetype: "audio/ogg; codecs=opus", seconds, ptt: false },
    opts
  );
  const audioMessage = sound.audioMessage;
  if (!visual.stickerMessage || !audioMessage?.mediaKey) {
    throw new Error("Gagal upload media stiker bersuara.");
  }
  try {
    const sidecar = await createStreamingSidecar(audio, audioMessage.mediaKey, audioMessage.fileEncSha256);
    if (sidecar) audioMessage.streamingSidecar = sidecar;
  } catch (e) {
    console.warn("[soundSticker] sidecar dilewati:", e.message);
  }

  const sticker = visual.stickerMessage;
  sticker.isAnimated = true;
  sticker.width = 512;
  sticker.height = 512;
  sticker.mimetype = "image/webp";
  sticker.stickerSentTs = Date.now();

  const msg = generateWAMessageFromContent(jid, { stickerMessage: sticker }, { userJid: sock.user.id, quoted });
  const content = msg.message;
  content[MARK] = buildSoundStickerWrapper(content.stickerMessage, audioMessage, emojis);

  await sock.relayMessage(jid, content, { messageId: msg.key.id });
  return msg;
}
