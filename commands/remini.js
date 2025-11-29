// commands/remini.js
const sharp = require("sharp");

module.exports = async ({ sock, msg, from, args, getMediaBuffer }) => {
  const media = await getMediaBuffer(msg);
  if (!media || media.type !== "imageMessage") {
    await sock.sendMessage(
      from,
      {
        text:
          "Reply foto dengan *.remini*.\n" +
          "Format:\n" +
          "• *.remini*  (level default)\n" +
          "• *.remini 50*  (level 1–100, makin besar makin kuat)",
      },
      { quoted: msg }
    );
    return;
  }

  // ===== BACA LEVEL (1–100) =====
  let level = 20; // default 20
  if (args && args.length > 0) {
    const n = parseInt(args[0]);
    if (!isNaN(n)) level = Math.min(Math.max(n, 1), 100);
  }

  // ubah level 1–100 jadi skala 0–1
  const strength = level / 100;

  // ===== METADATA & UPSCALE =====
  const baseSharp = sharp(media.buffer);
  const meta = await baseSharp.metadata();
  const w = meta.width || 512;
  const h = meta.height || 512;

  // faktor perbesaran: 1.3x sampai 2x tergantung level
  const upscaleBase = 1.3;
  const upscaleExtra = 0.7 * strength; // 0–0.7
  const factor = upscaleBase + upscaleExtra; // 1.3–2.0

  const newW = Math.min(Math.round(w * factor), 3000);
  const newH = Math.min(Math.round(h * factor), 3000);

  // ===== PIPELINE ENHANCE =====
  let pipe = sharp(media.buffer)
    .resize({
      width: newW,
      height: newH,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })

    // sedikit halusin noise dulu supaya nggak kasar
    .median(1); // semacam smoothing ringan

  // parameter sharpen & warna berdasarkan strength
  const sharpenSigma = 1 + 2 * strength; // 1–3
  const bright = 1 + 0.06 * strength; // 1–1.06
  const sat = 1 + 0.25 * strength; // 1–1.25

  pipe = pipe
    .sharpen(sharpenSigma) // tajam tapi terkontrol
    .modulate({
      brightness: bright,
      saturation: sat,
    })
    .normalize(); // tarik kontras biar kelihatan lebih “hidup”

  const out = await pipe
    .jpeg({
      quality: 94,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  await sock.sendMessage(
    from,
    {
      image: out,
      caption: `✨ Remini level ${level} (reply dari foto agak blur biar kelihatan bedanya)`,
    },
    { quoted: msg }
  );
};
