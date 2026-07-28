const fs = require("node:fs");
const path = require("node:path");

const webDir = path.join(__dirname, "..", "..", "web");
const outDir = path.join(__dirname, "..", "build-input");

const ENV_VARS_TO_BAKE = ["DATABASE_URL", "DATABASE_URL_REPORTING", "AUTH_SECRET"];

function loadEnvLocal() {
  const envPath = path.join(webDir, ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  const values = {};
  for (const line of content.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });

  fs.cpSync(path.join(webDir, ".next", "standalone"), outDir, { recursive: true });
  fs.cpSync(path.join(webDir, ".next", "static"), path.join(outDir, ".next", "static"), { recursive: true });
  fs.cpSync(path.join(webDir, "public"), path.join(outDir, "public"), { recursive: true });

  const env = loadEnvLocal();
  const missing = ENV_VARS_TO_BAKE.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s) in web/.env.local: ${missing.join(", ")}`);
  }
  const envFileContent = ENV_VARS_TO_BAKE.map((key) => `${key}=${env[key]}`).join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, ".env.production.local"), envFileContent);

  console.log(`Staged standalone build at ${outDir}`);
}

main();
