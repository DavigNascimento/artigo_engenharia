import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { forbidden, unauthorized } from "./errors.js";

const scrypt = promisify(scryptCallback);
const tokenLifetimeSeconds = 12 * 60 * 60;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, saltValue, hashValue] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertTokenSecret() {
  const secret = process.env.TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("TOKEN_SECRET deve ter pelo menos 32 caracteres.");
  return secret;
}

function signature(payload) {
  return createHmac("sha256", assertTokenSecret()).update(payload).digest("base64url");
}

export function createToken(userId, role) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    role,
    exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeToken(token) {
  const [payload, suppliedSignature, extra] = String(token || "").split(".");
  if (!payload || !suppliedSignature || extra) throw unauthorized();
  const expectedSignature = Buffer.from(signature(payload));
  const receivedSignature = Buffer.from(suppliedSignature);
  if (expectedSignature.length !== receivedSignature.length ||
      !timingSafeEqual(expectedSignature, receivedSignature)) throw unauthorized();
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw unauthorized();
  }
  if (!claims.sub || !claims.role || claims.exp <= Math.floor(Date.now() / 1000)) throw unauthorized();
  return { id: claims.sub, role: claims.role };
}

export function requireRole(request, allowedRoles) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) throw unauthorized();
  const user = decodeToken(header.slice(7));
  if (!allowedRoles.includes(user.role)) throw forbidden();
  return user;
}
