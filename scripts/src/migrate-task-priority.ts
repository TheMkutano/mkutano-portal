import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
  await db.execute(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority task_priority NOT NULL DEFAULT 'Medium'`);
  console.log("task_priority migration done");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
