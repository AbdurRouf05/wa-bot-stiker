import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "..", "temp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export default async (ctx) => {
  const { sock, from, msg, getMediaBuffer } = ctx;
  const media = await getMediaBuffer(msg);

  if (!media || media.type !== "imageMessage") {
    return await sock.sendMessage(
      from,
      { text: "Reply foto dengan *.remini* untuk memperjelas gambar." },
      { quoted: msg }
    );
  }

  const fileId = Date.now();
  const inputPath = path.join(TEMP_DIR, `remini_in_${fileId}.jpg`);
  const outputPath = path.join(TEMP_DIR, `remini_out_${fileId}.jpg`);
  const pythonScript = path.join(__dirname, "..", "utils", "enhance.py");

  try {
    await sock.sendMessage(from, { text: "⏳ *Sedang memproses foto...* (Local AI)" }, { quoted: msg });

    // Simpan buffer ke file temp
    fs.writeFileSync(inputPath, media.buffer);

    // Jalankan script Python
    await new Promise((resolve, reject) => {
      execFile("python3", [pythonScript, inputPath, outputPath], (err, stdout, stderr) => {
        if (err) {
          console.error("Python Error:", stderr);
          return reject(err);
        }
        resolve(stdout);
      });
    });

    if (!fs.existsSync(outputPath)) {
        throw new Error("Gagal menghasilkan foto yang ditingkatkan.");
    }

    const resultBuffer = fs.readFileSync(outputPath);

    await sock.sendMessage(
      from,
      { 
        image: resultBuffer,
        caption: "✅ *Proses Remini Selesai!* (Local AI)\nFoto telah diperjelas tanpa API eksternal." 
      },
      { quoted: msg }
    );

  } catch (error) {
    console.error("Remini Error:", error);
    await sock.sendMessage(from, { text: `❌ Gagal memproses Remini: ${error.message}` }, { quoted: msg });
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  }
};
