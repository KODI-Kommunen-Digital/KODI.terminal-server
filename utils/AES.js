import * as crypto from "crypto";

const algorithm = "aes-256-cbc";

function encrypt(data, key, iv) {
  if (key.length !== 64 || iv.length !== 32) {
    throw new Error("Key must be 64 hex characters and IV must be 32 hex characters.");
  }

  const keyBuffer = Buffer.from(key, "hex");
  const ivBuffer = Buffer.from(iv, "hex");
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, ivBuffer);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv + ":" + encrypted.toString("hex");
}

function decrypt(text, key) {
  const [ivHex, encryptedHex] = text.split(":");
  if (!ivHex || !encryptedHex) {
    throw new Error("Decryption failed: IV or encrypted data is missing.");
  }

  const ivBuffer = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(encryptedHex, "hex");
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== 32) {
    throw new Error("Key must be 64 hex characters.");
  }

  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, ivBuffer);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export { encrypt, decrypt };
