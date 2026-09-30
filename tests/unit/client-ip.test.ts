import { it, expect } from "vitest";
import { clientIP } from "../../apps/game-server/src/client-ip.js";
it("untrusted forwarding headers cannot spoof the rate-limit address", () => {
  expect(
    clientIP(
      "1.2.3.4",
      {
        "x-real-ip": "9.9.9.9",
        "x-world-client-ip": "8.8.8.8",
        "x-world-proxy-token": "wrong",
      },
      "server-key",
      [],
    ),
  ).toBe("1.2.3.4");
  expect(
    clientIP("10.203.0.4", { "x-real-ip": "9.9.9.9" }, undefined, [
      "10.203.0.4",
    ]),
  ).toBe("9.9.9.9");
  expect(
    clientIP(
      "1.2.3.4",
      { "x-world-client-ip": "8.8.8.8", "x-world-proxy-token": "server-key" },
      "server-key",
      [],
    ),
  ).toBe("8.8.8.8");
});
