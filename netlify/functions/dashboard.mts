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

  const source = await readFile(
    join(process.cwd(), "archive/2026-07-23_pre-q2-dashboard/index.html"),
    "utf8"
  );
  const sessionControls = `
    <div style="display:flex;gap:7px">
      <button id="accountAccess" type="button" style="border:1px solid rgba(56,189,248,.18);background:#111827;color:#94a3b8;padding:8px 10px;border-radius:7px;cursor:pointer">帳號與權限</button>
      <button id="sessionLogout" type="button" style="border:1px solid rgba(56,189,248,.18);background:#111827;color:#94a3b8;padding:8px 10px;border-radius:7px;cursor:pointer">登出</button>
    </div>`;
  const sessionScript = `
    document.getElementById('accountAccess').addEventListener('click',()=>{location.href='/?manage=users'});
    document.getElementById('sessionLogout').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/'});
  `;
  const html = source
    .replace('<div class="uc">S</div>', `${sessionControls}<div class="uc">S</div>`)
    .replace("</script>", `${sessionScript}</script>`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
};

export const config: Config = { path: "/dashboard" };
