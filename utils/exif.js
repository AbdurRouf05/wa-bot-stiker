// utils/exif.js — Tambahkan metadata EXIF ke stiker WebP (Simple & Safe)
import webpmux from "node-webpmux";

const STICKER_PACK = process.env.STICKER_PACK || "Abd Bot";
const STICKER_AUTHOR = process.env.STICKER_AUTHOR || "Bot";

/**
 * Tambahkan EXIF metadata ke buffer WebP.
 * Jika gagal, return buffer asli tanpa EXIF (graceful degradation).
 */
export async function addExifToWebpBuffer(webpBuffer, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  try {
    const img = new webpmux.Image();
    await img.load(webpBuffer);

    // Buat JSON metadata
    const json = JSON.stringify({
      "sticker-pack-id": "com.abdbot.sticker",
      "sticker-pack-name": packName,
      "sticker-pack-publisher": author,
      "emojis": ["😎"]
    });

    const jsonBuf = Buffer.from(json, "utf-8");

    // Buat EXIF TIFF header (22 bytes) + JSON data
    const exifPayload = Buffer.alloc(22 + jsonBuf.length);
    exifPayload.write("II", 0);             // Little-endian
    exifPayload.writeUInt16LE(0x002A, 2);   // TIFF magic
    exifPayload.writeUInt32LE(8, 4);        // Offset to IFD
    exifPayload.writeUInt16LE(1, 8);        // 1 IFD entry
    exifPayload.writeUInt16LE(0x5741, 10);  // Tag "WA"
    exifPayload.writeUInt16LE(7, 12);       // Type UNDEFINED
    exifPayload.writeUInt32LE(jsonBuf.length, 14); // Count
    exifPayload.writeUInt32LE(22, 18);      // Offset to data
    jsonBuf.copy(exifPayload, 22);

    img.exif = exifPayload;

    return await img.save(null);
  } catch (err) {
    console.error("[exif] Gagal menambahkan EXIF, kirim tanpa metadata:", err.message);
    return webpBuffer; // Graceful: return tanpa EXIF
  }
}

export { STICKER_PACK, STICKER_AUTHOR };
