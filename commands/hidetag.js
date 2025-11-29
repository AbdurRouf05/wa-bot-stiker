// commands/hidetag.js
module.exports = async ({ sock, msg, from, args }) => {
  const text = args.join(" ") || "Hidetag dari bot";
  const meta = await sock.groupMetadata(from).catch(() => null);
  if (!meta) {
    await sock.sendMessage(
      from,
      { text: "Command *.hidetag* hanya untuk grup." },
      { quoted: msg }
    );
    return;
  }

  const mentions = meta.participants.map((p) => p.id);
  await sock.sendMessage(
    from,
    { text, mentions },
    { quoted: msg }
  );
};
