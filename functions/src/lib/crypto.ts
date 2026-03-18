import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(secret: string, plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(secret: string, cipherText: string): string {
  const [ivEncoded, tagEncoded, payloadEncoded] = cipherText.split(".");
  if (!ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivEncoded, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function maskApiKey(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}
