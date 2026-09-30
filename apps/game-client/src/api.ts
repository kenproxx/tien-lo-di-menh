const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const API = env.VITE_API_URL ?? "";
export const WS =
  env.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001`;
export async function api<T = unknown>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`${API}/api${path}`, {
    method: method ?? (data ? "POST" : "GET"),
    headers: data ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.code ??
        result.error?.code ??
        result.error?.message ??
        result.error ??
        result.message ??
        "REQUEST_FAILED",
    );
  return result as T;
}
export const escape = (text: unknown) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function number(value: string | bigint | number) {
  const n = BigInt(value);
  if (n >= 1000000000000n)
    return `${n / 1000000000000n}.${(n % 1000000000000n) / 100000000000n}T`;
  if (n >= 1000000000n)
    return `${n / 1000000000n}.${(n % 1000000000n) / 100000000n}B`;
  if (n >= 1000000n) return `${n / 1000000n}.${(n % 1000000n) / 100000n}M`;
  if (n >= 10000n) return `${n / 1000n}.${(n % 1000n) / 100n}K`;
  return n.toLocaleString("vi-VN");
}
