import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
export function clientIP(
  remote: string,
  headers: IncomingHttpHeaders,
  proxyToken = process.env.WORLD_PROXY_TOKEN,
  trusted = (process.env.TRUSTED_PROXY_IPS ?? "").split(",").filter(Boolean),
) {
  const supplied = headers["x-world-proxy-token"],
    forwarded = headers["x-world-client-ip"];
  if (
    proxyToken &&
    typeof supplied === "string" &&
    typeof forwarded === "string" &&
    isIP(forwarded)
  ) {
    const a = Buffer.from(proxyToken),
      b = Buffer.from(supplied);
    if (a.length === b.length && timingSafeEqual(a, b)) return forwarded;
  }
  const address = remote.replace(/^::ffff:/, "");
  const real = headers["x-real-ip"];
  if (trusted.includes(address) && typeof real === "string" && isIP(real))
    return real;
  return address;
}
