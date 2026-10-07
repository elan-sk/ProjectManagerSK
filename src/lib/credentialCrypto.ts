import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Contraseñas de las credenciales: AES-256-GCM (mismo algoritmo que el Respaldo total) con una clave
// derivada de AUTH_SECRET — decisión del usuario 2026-10-07: no hay que configurar nada nuevo en
// producción. Si AUTH_SECRET cambia, las contraseñas ya guardadas no se pueden leer (decryptPassword
// devuelve null y la app lo muestra como «no se puede leer»; hay que volver a cargarlas).
// Formato guardado: "v1:<iv>:<tag>:<cifrado>" en base64.

const VERSION = "v1";
let cachedKey: { secret: string; key: Buffer } | null = null;

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET: no se pueden guardar ni leer las contraseñas guardadas.");
  if (cachedKey?.secret !== secret) cachedKey = { secret, key: scryptSync(secret, "pmsk-credentials-v1", 32) };
  return cachedKey.key;
}

export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** null si no se puede descifrar (AUTH_SECRET distinto al que la cifró, o dato dañado). */
export function decryptPassword(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
