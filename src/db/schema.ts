import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The id is the SHA-256 of the cookie token, so a database leak can't be replayed as a login.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  phone: text("phone").notNull().default(""),
  // Where new-booking notifications go.
  notifyEmail: text("notify_email").notNull(),
  timezone: text("timezone").notNull().default("Europe/Rome"),
  // Total seats in the room: the hard limit on covers at any moment.
  capacity: integer("capacity").notNull().default(40),
  // Optional pacing: max covers arriving in one slot, so the kitchen isn't flooded.
  maxCoversPerSlot: integer("max_covers_per_slot"),
  slotMinutes: integer("slot_minutes").notNull().default(15),
  durationMinutes: integer("duration_minutes").notNull().default(120),
  maxPartySize: integer("max_party_size").notNull().default(8),
  minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
  maxDaysAhead: integer("max_days_ahead").notNull().default(60),
  bookingOpen: boolean("booking_open").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Times are local "HH:MM" strings in the restaurant's timezone; end is the last arrival time.
export const serviceHours = pgTable(
  "service_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    // 0 = Monday … 6 = Sunday
    weekday: integer("weekday").notNull(),
    name: text("name").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (t) => [index("service_hours_restaurant_idx").on(t.restaurantId)],
);

export const closures = pgTable(
  "closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [uniqueIndex("closures_restaurant_date_idx").on(t.restaurantId, t.date)],
);

export const tableShape = pgEnum("table_shape", ["square", "round", "rect"]);

// Positions and sizes are in floor-plan units: the room is drawn on a 1000 × 625 canvas.
export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    seats: integer("seats").notNull(),
    shape: tableShape("shape").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
  },
  (t) => [index("dining_tables_restaurant_idx").on(t.restaurantId)],
);

export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
]);

export const reservationSource = pgEnum("reservation_source", ["online", "phone", "walk_in"]);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    time: text("time").notNull(),
    partySize: integer("party_size").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone").notNull().default(""),
    guestEmail: text("guest_email").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: reservationStatus("status").notNull().default("confirmed"),
    source: reservationSource("source").notNull(),
    // Removing a table from the plan keeps its bookings, just unassigned.
    tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    // Secret in the guest's link to view or cancel the booking without an account.
    manageToken: text("manage_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservations_restaurant_date_idx").on(t.restaurantId, t.date)],
);

export type Restaurant = typeof restaurants.$inferSelect;
export type ServiceHour = typeof serviceHours.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type DiningTable = typeof diningTables.$inferSelect;
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];
