// utils/exif.js — Tambahkan metadata EXIF ke stiker WebP
// Menggunakan format yang kompatibel dengan WhatsApp

const STICKER_PACK = "Abd Bot";
const STICKER_AUTHOR = "wa.me/6283854136611";

/**
 * Buat EXIF buffer untuk stiker WhatsApp
 */
function buildStickerExif(packName = STICKER_PACK, author = STICKER_AUTHOR) {
  const json = JSON.stringify({
    "sticker-pack-id": "com.abdbot.sticker",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": author,
    "emojis": ["😎"],
  });

  const data = Buffer.from(json, "utf-8");

  const exif = Buffer.alloc(data.length + 22);

  // Little-endian TIFF header
  exif.write("II", 0);                     // byte order
  exif.writeUInt16LE(0x002a, 2);            // TIFF magic
  exif.writeUInt32LE(8, 4);                 // offset to IFD

  // IFD with 1 entry
  exif.writeUInt16LE(1, 8);                 // number of entries

  // IFD entry: tag 0x5741 ("WA"), type UNDEFINED (7)
  exif.writeUInt16LE(0x5741, 10);           // tag
  exif.writeUInt16LE(7, 12);                // type = UNDEFINED
  exif.writeUInt32LE(data.length, 14);      // count
  exif.writeUInt32LE(22, 18);               // offset to data

  // JSON data
  data.copy(exif, 22);

  return exif;
}

/**
 * Tambahkan EXIF metadata ke buffer WebP
 * @param {Buffer} webpBuffer - Buffer WebP asli
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author
 * @returns {Buffer} WebP buffer dengan EXIF
 */
function addExifToWebpBuffer(webpBuffer, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  // Validasi: pastikan ini file WebP
  if (webpBuffer.slice(0, 4).toString() !== "RIFF" || webpBuffer.slice(8, 12).toString() !== "WEBP") {
    console.warn("[exif] Bukan file WebP valid, skip EXIF");
    return webpBuffer;
  }

  const exifData = buildStickerExif(packName, author);

  // Buat chunk EXIF
  const chunkId = Buffer.from("EXIF");
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(exifData.length);

  // Padding byte jika ukuran ganjil
  const padding = exifData.length % 2 !== 0 ? Buffer.alloc(1) : Buffer.alloc(0);

  // Gabungkan: WebP original + EXIF chunk
  const result = Buffer.concat([webpBuffer, chunkId, chunkSize, exifData, padding]);

  // Update RIFF file size (byte 4-7)
  result.writeUInt32LE(result.length - 8, 4);

  return result;
}

module.exports = { addExifToWebpBuffer, STICKER_PACK, STICKER_AUTHOR };
