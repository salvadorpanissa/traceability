-- Users are assigned to a farm (the top-level operation), not to an
-- individual establecimiento — a manager assigned to a farm operates every
-- establecimiento it contains. user_establishment already expanded a
-- per-establecimiento assignment to every sibling establecimiento of the
-- same farm at read time (see the old lib/dal/farm-access.ts); this makes
-- that the actual assignment, instead of an establecimiento standing in for
-- it. Not a pure rename — the FK target changes from establishment to farm —
-- so this creates the new table, backfills it from the old one, then drops
-- the old one, rather than an ALTER ... RENAME.

CREATE TABLE "user_farm" (
  "user_id" uuid NOT NULL,
  "farm_id" uuid NOT NULL,
  CONSTRAINT "user_farm_user_id_farm_id_pk" PRIMARY KEY ("user_id", "farm_id")
);
--> statement-breakpoint

ALTER TABLE "user_farm" ADD CONSTRAINT "user_farm_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "user_farm" ADD CONSTRAINT "user_farm_farm_id_farm_id_fk"
  FOREIGN KEY ("farm_id") REFERENCES "farm"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX "user_farm_farm_id_idx" ON "user_farm" ("farm_id");
--> statement-breakpoint

-- DISTINCT + FK/PK on the target collapses a user who was previously
-- assigned to several establecimientos of the same farm into one row.
INSERT INTO "user_farm" ("user_id", "farm_id")
SELECT DISTINCT "ue"."user_id", "e"."farm_id"
FROM "user_establishment" "ue"
JOIN "establishment" "e" ON "e"."id" = "ue"."establishment_id";
--> statement-breakpoint

DROP TABLE "user_establishment";
