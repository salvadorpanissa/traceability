import { config } from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { createDbClient } from "./client";
import {
  role,
  farm,
  establishment,
  userAccount,
  userFarm,
  owner,
  category,
  product,
  animal,
  animalTagHistory,
  event,
  eventRetag,
  eventRecategorize,
  eventTransfer,
  batchOperation,
  paddock,
} from "./schema";
import { estimateBirthDateFromAge } from "../lib/activities/date-normalization";

// Demo/showcase data: a manager assigned to one farm (operación) with two
// campos (establecimientos), 20 animals each (spread across ages so a
// monthly age-based recategorization replay produces real category-change
// history), a couple of health products, and one "lote" Excel per campo
// ready to upload from Actividades > Sanidad.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

const FARM_NAME = "Operación Demo";
const ESTABLISHMENT_NAMES = ["Campo 1", "Campo 2"];

const PADDOCK_NAMES = ["Potrero Norte", "Potrero Sur"];

// Sex-neutral "Recría" brackets every 2 months right after Ternero/a make
// the age-based recategorization replay below visibly change categories
// often — one shared ladder, topping out at 10 months (no 12/24-month
// categories for now).
const CATEGORIES = [
  { name: "Ternero", sex: "male" as const, minAgeMonths: 0 },
  { name: "Ternera", sex: "female" as const, minAgeMonths: 0 },
  { name: "Recría 2 meses", sex: null, minAgeMonths: 2 },
  { name: "Recría 4 meses", sex: null, minAgeMonths: 4 },
  { name: "Recría 6 meses", sex: null, minAgeMonths: 6 },
  { name: "Recría 8 meses", sex: null, minAgeMonths: 8 },
  { name: "Recría 10 meses", sex: null, minAgeMonths: 10 },
];

const PRODUCTS = [
  { name: "Ivermectina 1%", defaultDose: "1", defaultDoseUnit: "ml/50kg", defaultRoute: "Subcutánea", defaultWithdrawalDays: 35 },
  { name: "Vacuna Aftosa", defaultDose: "5", defaultDoseUnit: "ml", defaultRoute: "Intramuscular", defaultWithdrawalDays: 0 },
  { name: "Vitamina ADE", defaultDose: "10", defaultDoseUnit: "ml", defaultRoute: "Intramuscular", defaultWithdrawalDays: 0 },
];

const BREEDS = ["Hereford", "Angus", "Braford"];

// 20 ages spread from 2 to 38 months so, replayed month by month, animals
// cross the category brackets above at different points in time instead of
// all moving on the same day.
const AGE_MONTHS = [2, 4, 6, 8, 10, 12, 13, 15, 17, 19, 21, 23, 25, 26, 28, 30, 32, 34, 36, 38];

async function upsertRole(db: ReturnType<typeof createDbClient>, name: string) {
  const [existing] = await db.select().from(role).where(eq(role.name, name));
  if (existing) return existing;
  const [created] = await db.insert(role).values({ name }).returning();
  return created;
}

async function upsertFarm(db: ReturnType<typeof createDbClient>, name: string) {
  const [existing] = await db.select().from(farm).where(eq(farm.name, name));
  if (existing) return existing;
  const [created] = await db.insert(farm).values({ name }).returning();
  return created;
}

async function upsertEstablishment(db: ReturnType<typeof createDbClient>, farmId: string, name: string) {
  const [existing] = await db
    .select()
    .from(establishment)
    .where(and(eq(establishment.farmId, farmId), eq(establishment.name, name)));
  if (existing) return existing;
  const [created] = await db.insert(establishment).values({ farmId, name }).returning();
  return created;
}

async function upsertCategory(db: ReturnType<typeof createDbClient>, farmId: string, def: (typeof CATEGORIES)[number]) {
  const [existing] = await db
    .select()
    .from(category)
    .where(and(eq(category.farmId, farmId), eq(category.name, def.name)));
  if (existing) return existing;
  const [created] = await db.insert(category).values({ ...def, farmId }).returning();
  return created;
}

async function upsertProduct(db: ReturnType<typeof createDbClient>, farmId: string, def: (typeof PRODUCTS)[number]) {
  const [existing] = await db
    .select()
    .from(product)
    .where(and(eq(product.farmId, farmId), eq(product.name, def.name)));
  if (existing) return existing;
  const [created] = await db.insert(product).values({ ...def, farmId }).returning();
  return created;
}

async function upsertPaddock(db: ReturnType<typeof createDbClient>, establishmentId: string, name: string) {
  const [existing] = await db
    .select()
    .from(paddock)
    .where(and(eq(paddock.establishmentId, establishmentId), eq(paddock.name, name)));
  if (existing) return existing;
  const [created] = await db.insert(paddock).values({ establishmentId, name }).returning();
  return created;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function writeHealthLoteFile(establishmentName: string, tags: string[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sanidad");
  sheet.addRow(["IDE (caravana electrónica)"]);
  for (const tag of tags) sheet.addRow([tag]);
  const filePath = path.resolve(__dirname, "demo-fixtures", `sanidad-${slugify(establishmentName)}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "manager@campodemo.com";
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "Campo2026!";

  const db = createDbClient(connectionString);

  const [existingManager] = await db.select().from(userAccount).where(eq(userAccount.email, managerEmail));
  if (existingManager) {
    console.log(`Ya existe el manager demo (${managerEmail}); no se vuelve a sembrar.`);
    process.exit(0);
  }

  await upsertRole(db, "admin");
  const managerRole = await upsertRole(db, "manager");

  const demoFarm = await upsertFarm(db, FARM_NAME);

  const establishments = [];
  for (const name of ESTABLISHMENT_NAMES) establishments.push(await upsertEstablishment(db, demoFarm.id, name));

  const categoriesByName = new Map<string, { id: string }>();
  for (const def of CATEGORIES) categoriesByName.set(def.name, await upsertCategory(db, demoFarm.id, def));

  for (const def of PRODUCTS) await upsertProduct(db, demoFarm.id, def);

  const passwordHash = await bcrypt.hash(managerPassword, 10);
  const [manager] = await db
    .insert(userAccount)
    .values({ name: "Juan Pérez", email: managerEmail, passwordHash, roleId: managerRole.id })
    .returning();

  const [demoOwner] = await db.insert(owner).values({ name: "Juan Pérez" }).returning();

  // Assigned at the farm level (not per establecimiento) — a manager on a
  // farm operates every establecimiento it contains.
  await db.insert(userFarm).values({ userId: manager.id, farmId: demoFarm.id });

  const todayIso = new Date().toISOString().slice(0, 10);
  const fixtures: { establishmentName: string; tags: string[] }[] = [];

  for (const [establishmentIndex, est] of establishments.entries()) {
    const paddocks = [];
    for (const name of PADDOCK_NAMES) paddocks.push(await upsertPaddock(db, est.id, name));

    const [batch] = await db
      .insert(batchOperation)
      .values({ eventType: "transfer", establishmentId: est.id, animalCount: AGE_MONTHS.length, createdBy: manager.id })
      .returning();

    const tags: string[] = [];
    for (let i = 0; i < AGE_MONTHS.length; i++) {
      const sex = i % 2 === 0 ? ("male" as const) : ("female" as const);
      const birthDate = estimateBirthDateFromAge(todayIso, AGE_MONTHS[i]);
      // 15-digit electronic tag, ISO 11784-style: 858 = Uruguay country
      // code, then a fixed manufacturer block, then campo + sequence so
      // tags stay unique and sortable per campo.
      const tag = `858032${establishmentIndex + 1}${String(i).padStart(8, "0")}`;
      const initialCategory = categoriesByName.get(sex === "male" ? "Ternero" : "Ternera")!;

      const [createdAnimal] = await db
        .insert(animal)
        .values({ sex, ownerId: demoOwner.id, birthDate, breed: BREEDS[i % BREEDS.length] })
        .returning();
      await db.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag });

      const [retagEvent] = await db
        .insert(event)
        .values({
          eventType: "retag",
          eventDate: birthDate,
          animalId: createdAnimal.id,
          establishmentId: est.id,
          batchOperationId: batch.id,
          createdBy: manager.id,
        })
        .returning();
      await db.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: tag, newTag: tag });

      const [recategorizeEvent] = await db
        .insert(event)
        .values({
          eventType: "recategorize",
          eventDate: birthDate,
          animalId: createdAnimal.id,
          establishmentId: est.id,
          batchOperationId: batch.id,
          createdBy: manager.id,
        })
        .returning();
      await db.insert(eventRecategorize).values({
        eventId: recategorizeEvent.id,
        oldCategoryId: initialCategory.id,
        newCategoryId: initialCategory.id,
        source: "initial",
      });

      const [transferEvent] = await db
        .insert(event)
        .values({
          eventType: "transfer",
          eventDate: birthDate,
          animalId: createdAnimal.id,
          establishmentId: est.id,
          batchOperationId: batch.id,
          createdBy: manager.id,
        })
        .returning();
      await db.insert(eventTransfer).values({
        eventId: transferEvent.id,
        originEstablishmentId: est.id,
        destinationEstablishmentId: est.id,
        destinationPaddockId: paddocks[i % paddocks.length].id,
      });

      tags.push(tag);
    }
    fixtures.push({ establishmentName: est.name, tags });
  }

  await db.execute(sql`refresh materialized view concurrently animal_current_state`);

  // Dynamic import so dotenv.config() above finishes before this module's
  // "@/db" import chain reads process.env.DATABASE_URL (same trick as
  // db/recategorize-by-age.ts).
  const { runAgeBasedRecategorization } = await import("../lib/activities/age-recategorization");
  const oldestAgeMonths = Math.max(...AGE_MONTHS);
  for (let m = oldestAgeMonths; m >= 0; m--) {
    const asOfDate = estimateBirthDateFromAge(todayIso, m);
    await runAgeBasedRecategorization({ asOfDate });
  }

  const filePaths: string[] = [];
  for (const fixture of fixtures) filePaths.push(await writeHealthLoteFile(fixture.establishmentName, fixture.tags));

  console.log(`Seeded demo manager: ${managerEmail} / ${managerPassword}`);
  console.log(
    `Campos: ${establishments.map((e) => e.name).join(", ")} (20 animales c/u, potreros: ${PADDOCK_NAMES.join(", ")})`
  );
  console.log(`Productos: ${PRODUCTS.map((p) => p.name).join(", ")}`);
  console.log(`Archivos para cargar sanidad:\n${filePaths.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
