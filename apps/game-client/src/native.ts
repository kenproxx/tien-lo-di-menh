import { Capacitor } from "@capacitor/core";
export const native = Capacitor.isNativePlatform();
export function validateNativeEndpoints() {
  if (!native) return;
  const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
  if (
    !env.VITE_API_URL?.startsWith("https://") ||
    !env.VITE_WS_URL?.startsWith("wss://")
  )
    throw new Error(
      "Native builds require explicit HTTPS API and WSS endpoints.",
    );
}
