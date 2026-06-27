import axios from "axios";

export default async ({ sock, msg, from, getMediaBuffer }) => {
  const isImage = msg.message?.imageMessage;
  const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
  
  if (!isImage && !isQuotedImage) {
    await sock.sendMessage(from, { text: "⚠️ Kirim atau balas sebuah foto dengan caption *.remini* untuk memperjernihnya!" }, { quoted: msg });
    return;
  }
  
  await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });
  
  try {
    let mediaMsg = isImage ? msg : { message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
    const mediaData = await getMediaBuffer(mediaMsg);
    
    if (!mediaData || !mediaData.buffer) {
        throw new Error("Gagal mengunduh media dari pesan.");
    }
    
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
        "X-RapidAPI-Key": "c60a569d9bmshc8784a5743699a0p10423cjsn8b083ea602a2",
        "Content-Type": "application/json"
      },
      timeout: 60000 // tunggu maksimal 1 menit
    });

    let finalBuffer;

    if (response.data && response.data.image_base64) {
      finalBuffer = Buffer.from(response.data.image_base64, 'base64');
    } else if (response.data && response.data.image_url) {
      // Jika ternyata API mengembalikan URL gambar
      const imgRes = await axios.get(response.data.image_url, { responseType: 'arraybuffer' });
      finalBuffer = Buffer.from(imgRes.data);
    } else if (response.data && response.data.image) { // kadang response key-nya 'image'
      finalBuffer = Buffer.from(response.data.image, 'base64');
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
