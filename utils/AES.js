const crypto = require('crypto');

const algorithm = "aes-256-cbc";

function encrypt(data, key, iv = null) {
  if (key.length !== 64) {
    throw new Error("Key must be 64 hex characters (256 bits).");
  }

  if (iv && iv.length !== 32) {
    throw new Error("IV must be 32 hex characters (128 bits) if provided.");
  }

  const keyBuffer = Buffer.from(key, "hex");
  const ivBuffer = iv ? Buffer.from(iv, "hex") : crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, ivBuffer);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return ivBuffer.toString("hex") + ":" + encrypted.toString("hex");
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

module.exports = { encrypt, decrypt };
