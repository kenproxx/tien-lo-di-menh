import {
  migrate,
  pool,
  listCharacters,
  createCharacter,
} from "../packages/database/src/index.js";

try {
  await migrate();
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [["user", "session", "account", "verification"]],
  );
  if (tables.rows.length !== 4)
    throw new Error("AUTH_SCHEMA_VERIFICATION_FAILED");

  if (process.env.RUN_PRODUCTION_SEED === "1") {
    const email = process.env.SEED_DEMO_EMAIL;
    const password = process.env.SEED_DEMO_PASSWORD;
    if (!email || !password || password.length < 32)
      throw new Error("SECURE_SEED_CREDENTIAL_REQUIRED");
    let user = (
      await pool.query('SELECT id FROM "user" WHERE email=$1', [email])
    ).rows[0] as { id: string } | undefined;
    if (!user) {
      // Initialize Better Auth only after its database tables exist.
      const { auth } = await import("../apps/game-server/src/auth.js");
      user = (
        await auth.api.signUpEmail({
          body: { email, password, name: "Thanh Vân" },
        })
      ).user;
    }
    if (!(await listCharacters(user.id)).length)
      await createCharacter(user.id, "Thanh Vân");
    const account = await pool.query(
      'SELECT id FROM account WHERE "userId"=$1 AND "providerId"=$2 AND password IS NOT NULL',
      [user.id, "credential"],
    );
    if (!account.rows.length || !(await listCharacters(user.id)).length)
      throw new Error("SEED_VERIFICATION_FAILED");
    console.log("Production auth schema and secure seed verified.");
  } else {
    console.log("Production auth schema verified; seed not requested.");
  }

  if (process.argv.includes("--maintenance-only")) await pool.end();
  else await import("../apps/game-server/src/main.js");
} catch (error) {
  console.error(
    "Production initialization failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  await pool.end();
  process.exitCode = 1;
}
