import { migrate, pool } from "./index.js";
await migrate();
console.log("PostgreSQL schema migrated.");
await pool.end();
