// utils/exif.js — Tambahkan metadata EXIF ke stiker WebP (WebP Extended Format)
const STICKER_PACK = "Abd Bot";
const STICKER_AUTHOR = "wa.me/6283854136611";

/**
 * Buat EXIF buffer untuk stiker WhatsApp (TIFF structure)
 */
function buildStickerExif(packName = STICKER_PACK, author = STICKER_AUTHOR) {
  const json = {
    "sticker-pack-id": "com.abdbot.sticker",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": author,
    "emojis": ["😎"]
  };

  const data = Buffer.from(JSON.stringify(json), "utf-8");
  const exif = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00]),
    Buffer.alloc(4),
    Buffer.from([0x16, 0x00, 0x00, 0x00]),
    data
  ]);

  exif.writeUInt32LE(data.length, 14);
  return exif;
}

/**
 * Tambahkan EXIF metadata ke buffer WebP.
 * Menjamin file dalam format "WebP Extended" agar metadata terbaca oleh WhatsApp.
 * 
 * @param {Buffer} webpBuffer - Buffer WebP asli
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author
 * @returns {Buffer} WebP buffer dengan EXIF yang valid
 */
function addExifToWebpBuffer(webpBuffer, packName = STICKER_PACK, author = STICKER_AUTHOR) {
  // 1. Validasi WebP (RIFF....WEBP)
  if (webpBuffer.slice(0, 4).toString() !== "RIFF" || webpBuffer.slice(8, 12).toString() !== "WEBP") {
    return webpBuffer;
  }

  // 2. Buat EXIF chunk
  const exifData = buildStickerExif(packName, author);
  const exifHeader = Buffer.from("EXIF");
  const exifSize = Buffer.alloc(4);
  exifSize.writeUInt32LE(exifData.length);
  let exifChunk = Buffer.concat([exifHeader, exifSize, exifData]);
  if (exifChunk.length % 2 !== 0) exifChunk = Buffer.concat([exifChunk, Buffer.alloc(1)]);

  // 3. Identifikasi chunk data gambar (VP8, VP8L, atau ANIM)
  // Kita cari chunk pertama setelah header WEBP (offset 12)
  let offset = 12;
  let vp8xChunk = null;
  let imageChunkOffset = 12;

  while (offset < webpBuffer.length) {
    const chunkType = webpBuffer.slice(offset, offset + 4).toString();
    const chunkSize = webpBuffer.readUInt32LE(offset + 4);
    
    if (chunkType === "VP8X") {
      vp8xChunk = webpBuffer.slice(offset, offset + 8 + chunkSize + (chunkSize % 2));
    } else if (chunkType === "VP8 " || chunkType === "VP8L" || chunkType === "ANIM") {
      imageChunkOffset = offset;
      break;
    }
    
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  // 4. Jika tidak ada VP8X (Extended format), kita buat satu agar EXIF bisa masuk
  if (!vp8xChunk) {
    // Flag VP8X: ICC (bit 5), Alpha (bit 4), EXIF (bit 3), XMP (bit 2), Animation (bit 1)
    // Untuk stiker kita set EXIF bit (8). Jika stiker animasi (ada ANIM chunk), set Animation bit (2)
    let flags = 0x08; // Set EXIF bit
    const isAnim = webpBuffer.includes("ANIM"); // Quick check for animation
    if (isAnim) flags |= 0x02;

    const vp8xHeader = Buffer.from("VP8X");
    const vp8xSize = Buffer.from([0x0a, 0x00, 0x00, 0x00]); // VP8X selalu 10 bytes
    const vp8xData = Buffer.alloc(10);
    vp8xData[0] = flags;

    // Untuk lebar/tinggi di VP8X, ambil dari chunk image asli jika memungkinkan, 
    // Tapi stiker WA biasanya 511x511 (512-1). Kita set default aman 511.
    // Spec: actual-1. 511 = 0xFF 0x01 0x00
    vp8xData.writeUIntLE(511, 4, 3); // Width
    vp8xData.writeUIntLE(511, 7, 3); // Height

    vp8xChunk = Buffer.concat([vp8xHeader, vp8xSize, vp8xData]);
  } else {
    // Jika sudah ada VP8X, pastikan flag EXIF menyala
    vp8xChunk[8] |= 0x08;
  }

  // 5. Rakit ulang file: [Header RIFF] [VP8X] [EXIF] [SISA CHUNK ASLI]
  // Ambil data gambar (mulai dari imageChunkOffset sampai akhir)
  const imageData = webpBuffer.slice(imageChunkOffset);
  
  const headerRIFF = Buffer.from("RIFF");
  const headerWEBP = Buffer.from("WEBP");
  
  const result = Buffer.concat([
    headerRIFF,
    Buffer.alloc(4), // Placeholder untuk ukuran baru
    headerWEBP,
    vp8xChunk,
    exifChunk,
    imageData
  ]);

  // Update total size di RIFF header (total - 8)
  result.writeUInt32LE(result.length - 8, 4);

  return result;
}

module.exports = { addExifToWebpBuffer, STICKER_PACK, STICKER_AUTHOR };
