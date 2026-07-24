import type { Config, Context } from "@netlify/functions";
import { currentUser, json } from "./_auth.mts";

export default async (req: Request, _context: Context) => {
  const user = await currentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  return json({ user });
};

export const config: Config = { path: "/api/auth/me" };

