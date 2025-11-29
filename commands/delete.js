// commands/delete.js
module.exports = async ({ sock, msg, from }) => {
  const m = msg.message?.extendedTextMessage;
  const ctx = m?.contextInfo;
  if (!ctx?.stanzaId || !ctx?.participant) {
    await sock.sendMessage(
      from,
      { text: "Reply pesan bot dengan *.delete*." },
      { quoted: msg }
    );
    return;
  }

  await sock.sendMessage(from, {
    delete: {
      remoteJid: from,
      id: ctx.stanzaId,
      fromMe: true,
    },
  });
};
