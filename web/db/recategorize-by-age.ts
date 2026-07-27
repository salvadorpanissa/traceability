import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

async function main() {
  // Dynamic import to ensure dotenv.config() executes before loading
  // age-recategorization module (which uses @/db path alias)
  const { runAgeBasedRecategorization } = await import("../lib/activities/age-recategorization");
  const result = await runAgeBasedRecategorization();
  console.log(`Recategorized ${result.recategorized} animal(s) by age.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
