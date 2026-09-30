import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.kenproxx.tienlo",
  appName: "Tiên Lộ: Dị Mệnh",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#0b1314" },
  ios: { backgroundColor: "#0b1314", contentInset: "automatic" },
};
export default config;
