import type { Config, Context } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { currentUser } from "./_auth.mts";

export default async (req: Request, _context: Context) => {
  const user = await currentUser(req);
  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/?login=required" }
    });
  }

  const html = await readFile(join(process.cwd(), "dashboard-private.html"), "utf8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
};

export const config: Config = { path: "/dashboard" };
