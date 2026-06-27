import FormData from "form-data";

async function processing(buffer, method) {
  return new Promise((resolve, reject) => {
    let Methods = ["enhance", "recolor", "dehaze"];
    method = Methods.includes(method) ? method : Methods[0];
    
    let Form = new FormData();
    let scheme = "https://inferenceengine.vyro.ai/" + method;
    
    Form.append("model_version", 1, {
      "Content-Transfer-Encoding": "binary",
      contentType: "multipart/form-data; charset=uttf-8",
    });
    Form.append("image", buffer, {
      filename: "enhance_image_body.jpg",
      contentType: "image/jpeg",
    });
    
    Form.submit(
      {
        url: scheme,
        host: "inferenceengine.vyro.ai",
        path: "/" + method,
        protocol: "https:",
        headers: {
          "User-Agent": "okhttp/4.9.3",
          Connection: "Keep-Alive",
          "Accept-Encoding": "gzip",
        },
        rejectUnauthorized: false, // Bypass SSL certificate error
      },
      function (err, res) {
        if (err) return reject(err);
        let data = [];
        res.on("data", function (chunk) {
          data.push(chunk);
        }).on("end", () => {
          const resultBuffer = Buffer.concat(data);
          if (res.statusCode !== 200) {
              return reject(new Error(`API Error ${res.statusCode}: ${resultBuffer.toString()}`));
          }
          resolve(resultBuffer);
        }).on("error", (e) => {
          reject(e);
        });
      }
    );
  });
}

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
    
    const enhancedBuffer = await processing(mediaData.buffer, "enhance");
    
    await sock.sendMessage(
      from, 
      { image: enhancedBuffer, caption: "✨ *REMINI AI* ✨\n\nBerhasil diperjernih oleh Bot ABD!" }, 
      { quoted: msg }
    );
    
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
    
  } catch (error) {
    console.error("Remini Error:", error);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
    await sock.sendMessage(from, { text: "⚠️ Gagal memperjernih gambar. Server AI mungkin sedang sibuk atau gambar terlalu besar." }, { quoted: msg });
  }
};
