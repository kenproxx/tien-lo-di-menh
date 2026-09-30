import { randomUUID } from "node:crypto";
import { auth } from "../apps/game-server/src/auth.js";
import {
  pool,
  migrate,
  listCharacters,
  createCharacter,
} from "../packages/database/src/index.js";
if (process.env.NODE_ENV === "production")
  throw new Error("PRODUCTION_SEED_FORBIDDEN");
await migrate();
const email = "demo@tienlo.local",
  password = "TienLo-local-demo-2026";
let user = (await pool.query('SELECT id FROM "user" WHERE email=$1', [email]))
  .rows[0];
if (!user) {
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Thanh Vân" },
  });
  user = result.user;
}
if (!(await listCharacters(user.id)).length)
  await createCharacter(user.id, "Thanh Vân");
console.log(
  "Local demo account prepared: demo@tienlo.local. Password documented in README; production seed is forbidden.",
);
await pool.end();
