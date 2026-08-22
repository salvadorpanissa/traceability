import { config } from "dotenv";
import path from "node:path";

const ENV_FILES = {
  local: ".env.local",
  prod: ".env.production",
} as const;

export type EnvName = keyof typeof ENV_FILES;

// Reads --env=local|prod from argv (default: local) and loads that file's
// vars into process.env. A CLI flag instead of `ENV_FILE=... tsx script.ts`
// because `VAR=value cmd` is bash-only and breaks on native Windows shells
// (cmd.exe, PowerShell) that npm scripts run under on Windows.
export function loadEnv(): EnvName {
  const flag = process.argv.find((a) => a.startsWith("--env="));
  const envName = (flag?.slice("--env=".length) ?? "local") as EnvName;
  if (!(envName in ENV_FILES)) {
    throw new Error(`Unknown --env=${envName}, expected one of: ${Object.keys(ENV_FILES).join(", ")}`);
  }
  config({ path: path.resolve(__dirname, "..", ENV_FILES[envName]), quiet: true });
  return envName;
}
