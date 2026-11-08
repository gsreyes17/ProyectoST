import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Configuración privada de esta aplicación, independiente del directorio de arranque.
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
