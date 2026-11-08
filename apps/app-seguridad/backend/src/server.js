import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const server = createApp().listen(config.PORT, "127.0.0.1", () =>
  console.log(`Portal de Seguridad: http://localhost:${config.PORT}`),
);
async function close() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
