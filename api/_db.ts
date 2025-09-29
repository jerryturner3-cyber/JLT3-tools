import { Pool } from "pg";

let _pool: Pool | undefined;

export function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      // You can tune pool size if needed:
      // max: 5, idleTimeoutMillis: 30000
    });
  }
  return _pool;
}
