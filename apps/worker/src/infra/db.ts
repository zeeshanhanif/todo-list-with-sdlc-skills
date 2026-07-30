import { Pool } from "pg";

let pool: Pool | null = null;

// Lazy Postgres pool for the worker (ADR-003). In cloud it points at Supabase's
// pooler; locally at docker-compose Postgres. Isolated here so the job logic
// stays testable (see cleanup.service.spec.ts).
export function getPool(): Pool {
  if (!pool) {
    // No dotenv here: `main.ts` calls loadEnv() once at startup (DEF-007). A
    // lazy load inside a runtime path was the same defect in miniature — it read
    // the filesystem on first use and resolved `.env` against the process CWD.
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo",
    });
  }
  return pool;
}
