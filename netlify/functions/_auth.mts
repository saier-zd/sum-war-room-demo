import { getDatabase } from "@netlify/database";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "sum_session";
const SESSION_DAYS = 7;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, expectedHex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") || "";
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function bootstrapAdmin() {
  const email = Netlify.env.get("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
  const password = Netlify.env.get("BOOTSTRAP_ADMIN_PASSWORD");
  if (!email || !password) return;
  const db = getDatabase();
  const existing = await db.sql`SELECT id FROM app_users WHERE email = ${email}`;
  if (existing.length) return;
  const passwordHash = hashPassword(password);
  const permissions = JSON.stringify({
    manageUsers: true,
    viewAll: true,
    editStores: true,
    manageGuidance: true
  });
  await db.sql`
    INSERT INTO app_users (email, password_hash, role, display_name, permissions)
    VALUES (${email}, ${passwordHash}, 'system_admin', '系統管理員', ${permissions}::jsonb)
  `;
}

export async function createSession(userId: number) {
  const db = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.sql`
    INSERT INTO app_sessions (id, user_id, token_hash, expires_at)
    VALUES (${id}, ${userId}, ${tokenHash(token)}, ${expiresAt.toISOString()})
  `;
  return {
    token,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`
  };
}

export async function currentUser(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const db = getDatabase();
  const rows = await db.sql`
    SELECT u.id, u.email, u.role, u.display_name, u.permissions, u.regions, u.stores
    FROM app_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)}
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
  `;
  return rows[0] || null;
}

export async function destroySession(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const db = getDatabase();
    await db.sql`DELETE FROM app_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers });
}

