import { loadEnv } from "./env";

loadEnv();

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
