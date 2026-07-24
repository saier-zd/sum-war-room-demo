import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { bootstrapAdmin, createSession, hashPassword, json, verifyPassword } from "./_auth.mts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  await bootstrapAdmin();
  const { email = "", password = "" } = await req.json().catch(() => ({}));
  const normalizedEmail = String(email).trim().toLowerCase();
  const submittedPassword = String(password);
  const db = getDatabase();
  let rows = await db.sql`
    SELECT id, email, password_hash, role, display_name, permissions
    FROM app_users
    WHERE email = ${normalizedEmail} AND is_active = TRUE
  `;
  let user = rows[0];
  let passwordValid = Boolean(user && verifyPassword(submittedPassword, user.password_hash));

  // Recover a bootstrap administrator that was created before the final
  // environment password was available. The recovery can be consumed only once.
  const bootstrapEmail = Netlify.env.get("BOOTSTRAP_ADMIN_EMAIL")?.trim().toLowerCase();
  const bootstrapPassword = Netlify.env.get("BOOTSTRAP_ADMIN_PASSWORD");
  const bootstrapConsumed = Boolean(user?.permissions?.bootstrapConsumed);
  if (
    user?.role === "system_admin" &&
    !passwordValid &&
    !bootstrapConsumed &&
    normalizedEmail === bootstrapEmail &&
    submittedPassword === bootstrapPassword
  ) {
    const passwordHash = hashPassword(submittedPassword);
    rows = await db.sql`
      UPDATE app_users
      SET password_hash = ${passwordHash},
          permissions = COALESCE(permissions, '{}'::jsonb) || '{"bootstrapConsumed":true}'::jsonb,
          updated_at = NOW()
      WHERE id = ${user.id}
      RETURNING id, email, password_hash, role, display_name, permissions
    `;
    user = rows[0];
    passwordValid = true;
  }

  if (!user || !passwordValid) {
    return json({ error: "帳號或密碼錯誤" }, 401);
  }

  if (
    user.role === "system_admin" &&
    normalizedEmail === bootstrapEmail &&
    !user.permissions?.bootstrapConsumed
  ) {
    await db.sql`
      UPDATE app_users
      SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"bootstrapConsumed":true}'::jsonb,
          updated_at = NOW()
      WHERE id = ${user.id}
    `;
  }
  const session = await createSession(Number(user.id));
  return json(
    { user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name } },
    200,
    { "Set-Cookie": session.cookie }
  );
};

export const config: Config = { path: "/api/auth/login" };
