# Android/iOS — project sources, not verified releases
Capacitor 8.5.2 projects generated under apps/game-client/android and ios. Bundle web assets locally; configure VITE_API_URL=https://game.example.com and VITE_WS_URL=wss://game.example.com at build time. Default web loopback endpoints are prohibited in native startup guard. Ensure WEB_ORIGIN includes the exact Capacitor native origin when deploying server. Do not treat web cookie behavior as verified native authentication; secure session storage/bearer support and real-device lifecycle verification remain acceptance prerequisites.

Build frontend then `cd apps/game-client && pnpm exec cap sync`. Android `./android/gradlew -p android assembleDebug` needs supported Java/Android SDK. iOS needs macOS/Xcode/signing; Linux cannot produce or verify an installable iOS app. Keystores/provisioning profiles must remain outside source control.

Current evidence: mobile browser portrait flow and touch buttons pass Playwright; native projects generated. No APK installed, no real device background/network/audio tests, no iOS build or store publication. This is not T27/T28 completion.
