import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "database.json");

class Database {
  constructor() {
    this.data = {
      groups: {}, // { jid: { antilink: false, welcome: "" } }
      users: {},  // { jid: { limit: 10, premium: false } }
      settings: {} // global settings
    };
    this.load();
    this.saveTimer = null;
  }

  load() {
    if (fs.existsSync(DB_PATH)) {
      try {
        const content = fs.readFileSync(DB_PATH, "utf-8");
        this.data = JSON.parse(content);
      } catch (e) {
        console.error("❌ Gagal memuat database:", e.message);
      }
    } else {
      this.saveImmediate();
    }
  }

  saveImmediate() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("❌ Gagal menyimpan database:", e.message);
    }
  }

  /**
   * Menyimpan database dengan debounce (menunggu 2 detik)
   * agar tidak terlalu sering menulis ke disk (hemat I/O VPS).
   */
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveImmediate();
      this.saveTimer = null;
    }, 2000);
  }

  // Helper untuk Group
  getGroup(jid) {
    if (!this.data.groups[jid]) {
      this.data.groups[jid] = { antilink: false, welcome: "" };
      this.save();
    }
    return this.data.groups[jid];
  }

  updateGroup(jid, obj) {
    const group = this.getGroup(jid);
    Object.assign(group, obj);
    this.save();
  }

  // Helper untuk User
  getUser(jid) {
    if (!this.data.users[jid]) {
      this.data.users[jid] = { limit: 20, premium: false, xp: 0, isVerified: false };
      this.save();
    }
    return this.data.users[jid];
  }

  updateUser(jid, obj) {
    const user = this.getUser(jid);
    Object.assign(user, obj);
    this.save();
  }
}

const db = new Database();
export default db;
