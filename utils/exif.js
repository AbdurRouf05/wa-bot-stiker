// utils/exif.js — Tambahkan metadata EXIF ke stiker WebP
const fs = require("fs");
const path = require("path");

// Sticker metadata
const STICKER_PACK = "Abd Bot";
const STICKER_AUTHOR = "wa.me/6283854136611";

/**
 * Buat EXIF buffer untuk stiker WhatsApp
 * Format: JSON metadata yang di-embed ke WebP via RIFF chunk
 */
function buildStickerExif(packName = STICKER_PACK, author = STICKER_AUTHOR) {
  const json = JSON.stringify({
    "sticker-pack-id": "com.abdbot.sticker",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": author,
    "emojis": ["😎"],
    "is-avatar-sticker": 0,
    "android-app-store-link": "",
    "ios-app-store-link": "",
  });

  // Header EXIF untuk WebP
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);

  const jsonBuf = Buffer.from(json, "utf-8");
  // Set panjang JSON di EXIF header
  exifAttr.writeUIntLE(jsonBuf.length, 14, 4);

  return Buffer.concat([exifAttr, jsonBuf]);
}

/**
 * Tambahkan EXIF metadata ke file WebP
 * @param {string} webpPath - Path ke file WebP
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author/publisher
 * @returns {Buffer} WebP buffer dengan EXIF metadata
 */
function addExifToWebp(webpPath, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  const webpBuf = fs.readFileSync(webpPath);
  const exifData = buildStickerExif(packName, author);

  // Buat RIFF chunk "EXIF"
  const exifChunkHeader = Buffer.alloc(8);
  exifChunkHeader.write("EXIF", 0);
  exifChunkHeader.writeUInt32LE(exifData.length, 4);

  // Hitung total ukuran file baru
  const newFileSize =
    webpBuf.length + exifChunkHeader.length + exifData.length;

  // Update ukuran RIFF di header WebP (byte 4-7)
  const result = Buffer.concat([webpBuf, exifChunkHeader, exifData]);
  result.writeUInt32LE(newFileSize - 8, 4);

  return result;
}

/**
 * Tambahkan EXIF metadata ke buffer WebP (tanpa perlu file)
 * @param {Buffer} webpBuffer - Buffer WebP
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author/publisher
 * @returns {Buffer} WebP buffer dengan EXIF metadata
 */
function addExifToWebpBuffer(webpBuffer, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  const exifData = buildStickerExif(packName, author);

  // Buat RIFF chunk "EXIF"
  const exifChunkHeader = Buffer.alloc(8);
  exifChunkHeader.write("EXIF", 0);
  exifChunkHeader.writeUInt32LE(exifData.length, 4);

  // Gabungkan WebP + EXIF chunk
  const result = Buffer.concat([webpBuffer, exifChunkHeader, exifData]);

  // Update ukuran RIFF di header WebP
  result.writeUInt32LE(result.length - 8, 4);

  return result;
}

module.exports = { addExifToWebp, addExifToWebpBuffer, STICKER_PACK, STICKER_AUTHOR };
