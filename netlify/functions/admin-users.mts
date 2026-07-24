import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { currentUser, hashPassword, json } from "./_auth.mts";

const validRoles = new Set(["system_admin", "headquarters", "regional_manager", "store_user", "viewer"]);

async function sendWelcomeEmail(email: string) {
  const apiKey = Netlify.env.get("RESEND_API_KEY");
  const from = Netlify.env.get("ACCESS_EMAIL_FROM");
  const siteUrl = Netlify.env.get("URL");
  if (!apiKey || !from || !siteUrl) return { sent: false, reason: "email_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "SUM 保修戰情室｜帳號已開通",
      html: `<p>你的 SUM 保修戰情室帳號已開通。</p><p><a href="${siteUrl}">開啟戰情室</a></p><p>請使用管理員另行提供的初始密碼登入。</p>`
    })
  });
  return response.ok ? { sent: true } : { sent: false, reason: "email_delivery_failed" };
}

export default async (req: Request, _context: Context) => {
  const actor = await currentUser(req);
  if (!actor || actor.role !== "system_admin") return json({ error: "Forbidden" }, 403);
  const db = getDatabase();

  if (req.method === "GET") {
    const users = await db.sql`
      SELECT id, email, role, display_name, is_active, permissions, regions, stores, created_at
      FROM app_users ORDER BY created_at ASC
    `;
    return json({ users });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "viewer");
    if (!email.includes("@") || password.length < 8 || !validRoles.has(role)) {
      return json({ error: "請確認 Email、至少 8 碼密碼與角色設定" }, 422);
    }
    const passwordHash = hashPassword(password);
    const regions = JSON.stringify(Array.isArray(body.regions) ? body.regions : []);
    const stores = JSON.stringify(Array.isArray(body.stores) ? body.stores : []);
    const permissions = JSON.stringify(body.permissions && typeof body.permissions === "object" ? body.permissions : {});
    try {
      const [user] = await db.sql`
        INSERT INTO app_users (email, password_hash, role, display_name, permissions, regions, stores)
        VALUES (${email}, ${passwordHash}, ${role}, ${String(body.displayName || "")},
          ${permissions}::jsonb, ${regions}::jsonb, ${stores}::jsonb)
        RETURNING id, email, role, display_name, is_active, permissions, regions, stores, created_at
      `;
      const emailResult = await sendWelcomeEmail(email);
      return json({ user, email: emailResult }, 201);
    } catch (error: any) {
      if (error?.code === "23505") return json({ error: "此 Email 已存在" }, 409);
      throw error;
    }
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const isActive = Boolean(body.isActive);
    if (!id || id === Number(actor.id)) return json({ error: "不可停用目前登入的管理員帳號" }, 422);
    const [user] = await db.sql`
      UPDATE app_users SET is_active = ${isActive}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, role, display_name, is_active
    `;
    if (!user) return json({ error: "找不到使用者" }, 404);
    if (!isActive) await db.sql`DELETE FROM app_sessions WHERE user_id = ${id}`;
    return json({ user });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = { path: "/api/admin/users" };

