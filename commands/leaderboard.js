export default async ({ sock, msg, from, db }) => {
  const users = db.data.users;
  
  // Convert object to array
  const usersArray = Object.entries(users).map(([jid, data]) => ({
    jid,
    xp: data.xp || 0
  }));
  
  // Sort by XP descending
  usersArray.sort((a, b) => b.xp - a.xp);
  
  // Get top 10
  const top10 = usersArray.slice(0, 10).filter(u => u.xp > 0);
  
  if (top10.length === 0) {
    return await sock.sendMessage(
      from, 
      { text: "Belum ada pemain di leaderboard! Ayo main game untuk dapatkan XP!" }, 
      { quoted: msg }
    );
  }

  let text = `🏆 *TOP GLOBAL LEADERBOARD* 🏆\n\n`;
  const mentions = [];
  
  top10.forEach((user, index) => {
    let medal = "";
    if (index === 0) medal = "🥇";
    else if (index === 1) medal = "🥈";
    else if (index === 2) medal = "🥉";
    else medal = "🔸";
    
    text += `${medal} @${user.jid.split("@")[0]} - *${user.xp.toLocaleString("id-ID")} XP*\n`;
    mentions.push(user.jid);
  });
  
  text += `\n_Mainkan game .tebakkata atau .ttt untuk menambah XP kamu!_`;
  
  await sock.sendMessage(from, { text, mentions }, { quoted: msg });
};
