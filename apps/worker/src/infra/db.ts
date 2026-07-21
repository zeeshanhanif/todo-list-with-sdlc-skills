import { Pool } from "pg";
import { config as loadDotenv } from "dotenv";

let pool: Pool | null = null;

// Lazy Postgres pool for the worker (ADR-003). In cloud it points at Supabase's
// pooler; locally at docker-compose Postgres. Isolated here so the job logic
// stays testable (see cleanup.service.spec.ts).
export function getPool(): Pool {
  if (!pool) {
    loadDotenv();
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://todo:todo@localhost:5432/todo",
    });
  }
  return pool;
}
