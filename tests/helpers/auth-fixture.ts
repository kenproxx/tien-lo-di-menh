import { randomUUID } from "node:crypto";
import { auth } from "../../apps/game-server/src/auth.js";
// Prepare signed maintained-library sessions for gameplay tests; HTTP auth limits remain enabled.
export async function authFixture(name: string) {
  if (process.env.NODE_ENV === "production")
    throw new Error("PRODUCTION_TEST_FIXTURE_FORBIDDEN");
  const response = await auth.api.signUpEmail({
    body: {
      name,
      email: `fixture-${randomUUID()}@example.com`,
      password: "Fixture-password-2026",
    },
    headers: new Headers({ Origin: "http://localhost:5173" }),
    asResponse: true,
  });
  if (!response.ok) throw new Error("AUTH_FIXTURE_FAILED:" + response.status);
  const pairs = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => c.startsWith("better-auth."));
  return {
    cookie: pairs.join("; "),
    cookies: pairs.map((pair) => {
      const at = pair.indexOf("=");
      return {
        name: pair.slice(0, at),
        value: pair.slice(at + 1),
        url: "http://localhost:5173",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    }),
  };
}
