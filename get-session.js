import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const credsPath = path.join(__dirname, "auth", "creds.json");

if (!fs.existsSync(credsPath)) {
  console.log("❌ File auth/creds.json belum ada. Pastikan Anda sudah login WA di lokal terlebih dahulu.");
  process.exit(1);
}

const credsBuffer = fs.readFileSync(credsPath);
const base64Session = credsBuffer.toString("base64");

console.log("\n==================================================");
console.log("✅ BERHASIL! Copy teks di bawah ini dan jadikan value untuk SESSION_ID di Coolify:\n");
console.log(base64Session);
console.log("\n==================================================\n");
