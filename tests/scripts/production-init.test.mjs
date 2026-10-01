import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import pg from "pg";

test(
  "production maintenance migrates auth schema and seeds only one secure starter character",
  {
    skip: !process.env.MAINTENANCE_TEST_DATABASE_URL,
  },
  async () => {
    const email = `seed-${randomUUID()}@example.com`;
    const env = {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: process.env.MAINTENANCE_TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
      BETTER_AUTH_URL: "https://example.com",
      WEB_ORIGIN: "https://example.com",
      RUN_PRODUCTION_SEED: "1",
      SEED_DEMO_EMAIL: email,
      SEED_DEMO_PASSWORD: randomUUID() + randomUUID(),
    };
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(
        "./node_modules/.bin/tsx",
        ["scripts/production-init.ts", "--maintenance-only"],
        { env, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /auth schema and secure seed verified/);
    }
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query(
        'SELECT (SELECT count(*) FROM "user" WHERE email=$1)::int AS users, (SELECT count(*) FROM characters c JOIN "user" u ON c.account_id=u.id WHERE u.email=$1)::int AS characters',
        [email],
      );
      assert.equal(result.rows[0].users, 1);
      assert.equal(result.rows[0].characters, 1);
    } finally {
      await client.end();
    }
  },
);
