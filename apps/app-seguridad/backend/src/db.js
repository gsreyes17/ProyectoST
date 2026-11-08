import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});
pool.on("error", () => console.error("Se perdió una conexión con PostgreSQL."));

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
