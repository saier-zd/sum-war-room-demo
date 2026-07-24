import type { Config, Context } from "@netlify/functions";
import { destroySession, json } from "./_auth.mts";

export default async (req: Request, _context: Context) => {
  const cookie = await destroySession(req);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
};

export const config: Config = { path: "/api/auth/logout" };

