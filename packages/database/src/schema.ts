import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  numeric,
  bigint,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CharacterState } from "./state.js";
export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    slot: integer("slot").notNull(),
    name: text("name").notNull(),
    state: jsonb("state").$type<CharacterState>().notNull(),
    coins: numeric("coins", { precision: 20, scale: 0 }).notNull(),
    spirit: numeric("spirit", { precision: 20, scale: 0 }).notNull(),
    exp: numeric("exp", { precision: 20, scale: 0 }).notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    deletedUntil: timestamp("deleted_until", { withTimezone: true }),
  },
  (t) => [
    unique("characters_account_slot").on(t.accountId, t.slot),
    check("coins_u64", sql`${t.coins} BETWEEN 0 AND 18446744073709551615`),
    check("spirit_u64", sql`${t.spirit} BETWEEN 0 AND 18446744073709551615`),
    check("exp_u64", sql`${t.exp} BETWEEN 0 AND 18446744073709551615`),
  ],
);
