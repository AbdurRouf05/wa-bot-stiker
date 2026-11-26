// commands/todocx.js — .todocx: PDF → Word (docx) via pdf2docx
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tmp, run, cleanup } from "../utils.js";

export const aliases = ["docx", "toword", "pdftoword"];

const PYTHON = process.env.PYTHON_BIN || "python3";
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "utils", "pdf2docx_convert.py");
const MAX_BYTES = 20 * 1024 * 1024;

export default async ({ sock, msg, from, getMediaBuffer }) => {
  let media = null;
  try { media = await getMediaBuffer(msg); } catch {}
  const isPdf = media?.type === "documentMessage" &&
    ((media.mimetype || "").includes("pdf") || /\.pdf$/i.test(media.fileName || ""));

  if (!isPdf) {
    await sock.sendMessage(from, { text: "📝 *PDF → Word*\nReply/kirim file PDF dengan *.todocx*\n\nKebalikannya: *.topdf*" }, { quoted: msg });
    return;
  }
  if (media.buffer.length > MAX_BYTES) {
    await sock.sendMessage(from, { text: "⚠️ PDF terlalu besar (maks 20 MB)." }, { quoted: msg });
    return;
  }

  await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
  const input = tmp("pdf");
  const output = tmp("docx");
  try {
    fs.writeFileSync(input, media.buffer);
    await run(PYTHON, [SCRIPT, input, output], { timeout: 180_000 });
    const docx = fs.readFileSync(output);
    const baseName = (media.fileName || "dokumen").replace(/\.pdf$/i, "");
    await sock.sendMessage(
      from,
      {
        document: docx,
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: `${baseName}.docx`,
      },
      { quoted: msg }
    );
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("❌ todocx error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    const reason = /password/i.test(err.message) ? "PDF terkunci password." : err.message;
    await sock.sendMessage(from, { text: `❌ Gagal konversi PDF ke Word.\n${reason}` }, { quoted: msg });
  } finally {
    cleanup(input, output);
  }
};
