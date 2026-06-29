import { clearSessionCookie, destroySession } from "@/lib/auth";

export async function POST(request) {
  destroySession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
