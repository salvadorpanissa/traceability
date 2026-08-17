CREATE TABLE "column_header_meaning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header" text NOT NULL,
	"meaning" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "column_header_meaning_header_unique" UNIQUE("header")
);
