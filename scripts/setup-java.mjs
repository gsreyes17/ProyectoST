import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appPath, applications } from "./project.mjs";

export const jdbcVersion = "42.7.14";
export const jdbcFile = appPath(
  applications.find((app) => app.slug === "almacen"),
  `backend/.local/lib/postgresql-${jdbcVersion}.jar`,
);
const source = `https://repo.maven.apache.org/maven2/org/postgresql/postgresql/${jdbcVersion}/postgresql-${jdbcVersion}.jar`;
const expected =
  "73914527305a40cce504b0d3d90b23caf565136912d607ae8ae7c5895512332c";
export async function setupJava() {
  let bytes;
  if (existsSync(jdbcFile)) bytes = await readFile(jdbcFile);
  else {
    const binary = await fetch(source, { signal: AbortSignal.timeout(30000) });
    if (!binary.ok)
      throw new Error("No se pudo obtener el driver JDBC oficial.");
    bytes = Buffer.from(await binary.arrayBuffer());
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual)
    throw new Error("El checksum del driver JDBC no coincide.");
  await mkdir(path.dirname(jdbcFile), { recursive: true });
  await writeFile(jdbcFile, bytes);
  console.log(
    `Driver JDBC ${jdbcVersion} descargado y verificado. No se incluye en Git.`,
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupJava().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
