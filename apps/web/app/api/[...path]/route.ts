import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const base = process.env.GAME_SERVER_URL;
  if (!base)
    return Response.json({ error: "GAME_SERVER_UNAVAILABLE" }, { status: 503 });
  const destination = new URL(
    "/api/" + path.map(encodeURIComponent).join("/") + request.nextUrl.search,
    base,
  );
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if(process.env.WORLD_PROXY_TOKEN){headers.set("x-world-proxy-token",process.env.WORLD_PROXY_TOKEN);if(process.env.VERCEL==="1"){const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();if(ip)headers.set("x-world-client-ip",ip);}}
  try {
    const upstream = await fetch(destination, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const output = new Headers({
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    for (const cookie of upstream.headers.getSetCookie())
      output.append("set-cookie", cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: output,
    });
  } catch {
    return Response.json({ error: "GAME_SERVER_UNAVAILABLE" }, { status: 503 });
  }
}
export const GET = proxy,
  POST = proxy,
  DELETE = proxy,
  OPTIONS = proxy;
