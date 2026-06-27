// commands/profile.js

function getLevel(xp) {
  // Simple leveling formula: level = sqrt(xp / 100)
  // 100 xp = lvl 1, 400 xp = lvl 2, 900 xp = lvl 3, etc.
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / 100));
}

function getRole(level) {
  if (level >= 50) return "👑 Mythic Lord";
  if (level >= 40) return "🌟 Legendary Hero";
  if (level >= 30) return "⚔️ Grand Master";
  if (level >= 20) return "🛡️ Elite Knight";
  if (level >= 10) return "🏹 Seasoned Adventurer";
  if (level >= 5) return "🗡️ Novice Fighter";
  return "🌱 Peasant";
}

export default async ({ sock, from, msg, db }) => {
  const sender = msg.key.participant || msg.key.remoteJid;
  
  // Get data from DB
  const userData = db.getUser(sender);
  const pushName = msg.pushName || "Unknown Player";
  
  const xp = userData.xp || 0;
  const level = getLevel(xp);
  const role = getRole(level);
  const limit = userData.limit || 0;
  const isPremium = userData.premium ? "✅ Yes" : "❌ No";
  
  // Hitung XP yang dibutuhkan untuk level berikutnya
  const nextLevel = level + 1;
  const xpForNextLevel = Math.pow(nextLevel, 2) * 100;
  
  // Progress bar sederhana (10 kotak)
  const currentLevelXp = Math.pow(level, 2) * 100;
  const xpProgress = xp - currentLevelXp;
  const xpNeeded = xpForNextLevel - currentLevelXp;
  const progressPercent = (xpProgress / xpNeeded) * 10;
  
  let progressBar = "";
  for (let i = 0; i < 10; i++) {
    progressBar += i < progressPercent ? "🟩" : "⬜";
  }

  const text = `
╭━━━〔 *PLAYER PROFILE* 〕━━━
┃ 👤 *Name* : ${pushName}
┃ 📛 *Role* : ${role}
┃ 🌟 *Level* : ${level}
┃ 🎖️ *Rank*  : ${isPremium} (Premium)
╰━━━━━━━━━━━━━━━━━━━━━━

╭━━━〔 *STATUS & STATS* 〕━━━
┃ 🪙 *EXP*   : ${xp.toLocaleString('id-ID')} / ${xpForNextLevel.toLocaleString('id-ID')}
┃ 📊 *Prog*  : [${progressBar}]
┃ 🔋 *Limit* : ${limit} / 20
╰━━━━━━━━━━━━━━━━━━━━━━

_Mainkan .tebakkata atau .ttt untuk menaikkan levelmu!_
  `.trim();

  // Kirim profile text (jika bisa ambil PP, kita bisa kirim image, tapi text lebih cepat dan aman)
  await sock.sendMessage(from, { text }, { quoted: msg });
};
