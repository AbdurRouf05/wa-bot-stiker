import axios from "axios";
import { mediaKind } from "../utils.js";

export default async ({ sock, msg, from, getMediaBuffer }) => {
  if (!process.env.RAPIDAPI_KEY) {
    await sock.sendMessage(from, { text: "⚠️ RAPIDAPI_KEY belum diatur di server." }, { quoted: msg });
    return;
  }
  let mediaData = null;
  try { mediaData = await getMediaBuffer(msg); } catch {}
  if (mediaKind(mediaData) !== "image") {
    await sock.sendMessage(from, { text: "⚠️ Kirim atau balas sebuah foto dengan caption *.remini* untuk memperjernihnya!" }, { quoted: msg });
    return;
  }

  await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

  try {
    // Ubah gambar asli ke format base64
    const base64Image = mediaData.buffer.toString('base64');
    
    // Panggil RapidAPI (Photo Enhance API)
    const response = await axios.post("https://photo-enhance-api.p.rapidapi.com/api/scale", {
      image_base64: base64Image,
      type: "clean",
      scale_factor: 2
    }, {
      headers: {
        "X-RapidAPI-Host": "photo-enhance-api.p.rapidapi.com",
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "Content-Type": "application/json"
      },
      timeout: 60000 // tunggu maksimal 1 menit
    });

    let finalBuffer;

    if (response.data && response.data.image_base64) {
      finalBuffer = Buffer.from(response.data.image_base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    } else if (response.data && response.data.image_url) {
      // Jika ternyata API mengembalikan URL gambar
      const imgRes = await axios.get(response.data.image_url, { responseType: 'arraybuffer' });
      finalBuffer = Buffer.from(imgRes.data);
    } else if (response.data && response.data.image) { // kadang response key-nya 'image'
      finalBuffer = Buffer.from(response.data.image.replace(/^data:[^;]+;base64,/, ''), 'base64');
    } else {
      throw new Error(`Format response API tidak dikenali. Data: ${JSON.stringify(response.data).substring(0, 50)}`);
    }
    
    await sock.sendMessage(
      from, 
      { image: finalBuffer, caption: "✨ *REMINI AI (RapidAPI)* ✨\n\nBerhasil diperjernih oleh Bot ABD!" }, 
      { quoted: msg }
    );
    
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
    
  } catch (error) {
    console.error("Remini Error:", error);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    
    const errMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    await sock.sendMessage(from, { text: `⚠️ Gagal memperjernih gambar.\n\nDetail Error: ${errMessage}` }, { quoted: msg });
  }
};
