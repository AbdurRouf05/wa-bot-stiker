// commands/topdf.js — .topdf: dokumen Office / gambar / teks → PDF
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { tmp, run, cleanup, mediaKind } from "../utils.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const aliases = ["pdf", "keppdf"];

const SOFFICE = process.env.SOFFICE_BIN || "soffice";
const OFFICE_EXT = ["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp"];
const MIME_EXT = {
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/plain": "txt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

function officeExt(media) {
  const fromName = path.extname(media.fileName || "").slice(1).toLowerCase();
  if (OFFICE_EXT.includes(fromName)) return fromName;
  return MIME_EXT[(media.mimetype || "").split(";")[0]] || null;
}

/** Konversi file Office pakai LibreOffice headless. Return buffer PDF. */
export async function officeToPdf(inputPath) {
  const outDir = tmp("dir");
  const profile = tmp("lo");
  fs.mkdirSync(outDir, { recursive: true });
  try {
    await run(SOFFICE, [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--headless", "--norestore", "--nolockcheck",
      "--convert-to", "pdf", "--outdir", outDir, inputPath,
    ], { timeout: 120_000 });
    const pdf = fs.readdirSync(outDir).find((f) => f.endsWith(".pdf"));
    if (!pdf) throw new Error("LibreOffice tidak menghasilkan PDF.");
    return fs.readFileSync(path.join(outDir, pdf));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

/** Gambar → PDF satu halaman (JPEG langsung disematkan, tanpa dependensi tambahan). */
async function imageToPdf(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null, // gambar (binary)
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [];
  let size = parts[0].length;
  const push = (buf) => { parts.push(buf); size += buf.length; };
  objects.forEach((obj, i) => {
    offsets.push(size);
    if (obj === null) {
      push(Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`));
      push(data);
      push(Buffer.from("\nendstream\nendobj\n"));
    } else {
      push(Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`));
    }
  });
  const xref = size;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) tail += `${String(off).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(Buffer.from(tail));
  return Buffer.concat(parts);
}

export default async ({ sock, msg, from, text, getMediaBuffer }) => {
  let media = null;
  try { media = await getMediaBuffer(msg); } catch {}
  const kind = mediaKind(media);
  const rawText = (text || "").replace(/^\S+\s?/, "").trim();

  let mode = null;
  if (kind === "image") mode = "image";
  else if (media && media.type === "documentMessage" && officeExt(media)) mode = "office";
  else if (!media && rawText) mode = "text";

  if (!mode) {
    await sock.sendMessage(
      from,
      { text: "📄 *Konversi ke PDF*\n\n• Reply/kirim dokumen (docx, doc, xlsx, pptx, odt, rtf, txt) dengan *.topdf*\n• Reply/kirim foto dengan *.topdf*\n• *.topdf <teks>* → teks jadi PDF\n\nKebalikannya: reply PDF dengan *.todocx*" },
      { quoted: msg }
    );
    return;
  }

  await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
  const baseName = (media?.fileName || "dokumen").replace(/\.[^.]+$/, "") || "dokumen";
  let input = null;
  try {
    let pdf;
    if (mode === "image") {
      pdf = await imageToPdf(media.buffer);
    } else {
      input = tmp(mode === "text" ? "txt" : officeExt(media));
      fs.writeFileSync(input, mode === "text" ? rawText : media.buffer);
      pdf = await officeToPdf(input);
    }
    await sock.sendMessage(
      from,
      { document: pdf, mimetype: "application/pdf", fileName: `${mode === "image" ? "gambar" : baseName}.pdf` },
      { quoted: msg }
    );
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
  } catch (err) {
    console.error("❌ topdf error:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(from, { text: `❌ Gagal konversi ke PDF.\n${err.message}` }, { quoted: msg });
  } finally {
    if (input) cleanup(input);
  }
};
