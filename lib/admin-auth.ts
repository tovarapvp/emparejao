import { env } from "cloudflare:workers";

const ADMIN_COOKIE = "emparejao-admin-session";
const DEFAULT_SUPER_ADMIN_EMAIL = "tovarapvp@gmail.com";
// Keep password hashing below the 10 ms CPU budget of Cloudflare Workers Free.
// Web Crypto still performs the work natively; 50k iterations takes roughly 5 ms.
const PASSWORD_ITERATIONS = 50_000;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

interface AdminSessionRecord {
  id: string;
  admin_user_id: string;
  email: string;
  expires_at: number;
  last_seen_at: number;
}

export interface AdminIdentity {
  id: string;
  email: string;
  sessionId: string;
}

export const ADMIN_AUDIT_ACTION = {
  PASSWORD_CHANGED: "password_changed",
  SESSIONS_REVOKED: "sessions_revoked",
} as const;

export type AdminAuditAction =
  (typeof ADMIN_AUDIT_ACTION)[keyof typeof ADMIN_AUDIT_ACTION];

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function superAdminEmail() {
  return env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_SUPER_ADMIN_EMAIL;
}

export function setupTokenConfigured() {
  return (env.ADMIN_SETUP_TOKEN?.trim().length ?? 0) >= 24;
}

export function validateAdminPassword(password: string) {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export async function createPasswordRecord(password: string) {
  const salt = randomToken(24);
  return { salt, hash: await derivePasswordHash(password, salt) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = await derivePasswordHash(password, salt);
  return constantTimeEqual(actualHash, expectedHash);
}

export async function verifySetupToken(candidate: string) {
  const expected = env.ADMIN_SETUP_TOKEN?.trim() ?? "";
  if (expected.length < 24 || candidate.length < 1) return false;
  const [candidateHash, expectedHash] = await Promise.all([
    sha256(candidate),
    sha256(expected),
  ]);
  return constantTimeEqual(candidateHash, expectedHash);
}

export async function createAdminSession(database: D1Database, adminUserId: string) {
  const token = randomToken();
  const now = Date.now();
  await database
    .prepare(
      `INSERT INTO admin_sessions
       (id, admin_user_id, token_hash, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      adminUserId,
      await sha256(token),
      now,
      now + SESSION_DURATION_MS,
      now,
    )
    .run();
  return token;
}

export function adminSessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure}`;
}

export function clearAdminSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

export async function adminIdentity(request: Request, database: D1Database) {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const session = await database
    .prepare(
      `SELECT s.id, s.admin_user_id, s.expires_at, s.last_seen_at, u.email
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
       WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<AdminSessionRecord>();
  if (!session) return null;

  if (now - session.last_seen_at > 5 * 60 * 1000) {
    await database
      .prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?")
      .bind(now, session.id)
      .run();
  }

  return {
    id: session.admin_user_id,
    email: session.email,
    sessionId: session.id,
  } satisfies AdminIdentity;
}

export async function deleteAdminSession(request: Request, database: D1Database) {
  const token = cookieValue(request, ADMIN_COOKIE);
  if (!token) return;
  await database
    .prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}
