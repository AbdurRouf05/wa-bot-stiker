// utils/exif.js — Tambahkan metadata EXIF ke stiker WebP (Simple & Safe)
const STICKER_PACK = process.env.STICKER_PACK || "Abd Bot";
const STICKER_AUTHOR = process.env.STICKER_AUTHOR || "Bot";

/**
 * Tambahkan EXIF metadata ke buffer WebP.
 * Jika gagal, return buffer asli tanpa EXIF (graceful degradation).
 */
function addExifToWebpBuffer(webpBuffer, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  try {
    // Validasi WebP
    if (!webpBuffer || webpBuffer.length < 12) return webpBuffer;
    if (webpBuffer.slice(0, 4).toString() !== "RIFF") return webpBuffer;
    if (webpBuffer.slice(8, 12).toString() !== "WEBP") return webpBuffer;

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

    // Buat EXIF RIFF chunk
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write("EXIF", 0);
    chunkHeader.writeUInt32LE(exifPayload.length, 4);

    // Padding jika ganjil
    const padding = exifPayload.length % 2 !== 0 ? Buffer.alloc(1) : Buffer.alloc(0);

    // Gabung: original WebP + EXIF chunk (append di akhir)
    const result = Buffer.concat([webpBuffer, chunkHeader, exifPayload, padding]);

    // Update RIFF total size
    result.writeUInt32LE(result.length - 8, 4);

    return result;
  } catch (err) {
    console.error("[exif] Gagal menambahkan EXIF, kirim tanpa metadata:", err.message);
    return webpBuffer; // Graceful: return tanpa EXIF
  }
}

module.exports = { addExifToWebpBuffer, STICKER_PACK, STICKER_AUTHOR };
