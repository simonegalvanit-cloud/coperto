CREATE TYPE "public"."fixture_kind" AS ENUM('wall', 'door', 'window', 'kitchen', 'bar', 'cash', 'stairs', 'toilets', 'column', 'plant', 'entrance', 'station', 'other');--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"kind" "fixture_kind" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bookable_online" boolean DEFAULT true NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "floor_id" uuid;--> statement-breakpoint
-- Tables drawn before floors existed move onto a "Piano terra" the size of the old 1000 × 625 canvas.
INSERT INTO "floors" ("restaurant_id", "name", "level", "width", "height", "position")
SELECT DISTINCT "restaurant_id", 'Piano terra', 0, 1000, 625, 0 FROM "dining_tables";--> statement-breakpoint
UPDATE "dining_tables" SET "floor_id" = "floors"."id" FROM "floors" WHERE "floors"."restaurant_id" = "dining_tables"."restaurant_id";--> statement-breakpoint
ALTER TABLE "dining_tables" ALTER COLUMN "floor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "min_covers" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "bookable_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixtures_restaurant_idx" ON "fixtures" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "floors_restaurant_idx" ON "floors" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "zones_restaurant_idx" ON "zones" USING btree ("restaurant_id");--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;