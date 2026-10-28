import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
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
  // Email guests the day before to confirm or cancel.
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
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

// Floor plans are measured in centimetres: a table 80 wide is 80 cm, a floor 1400 wide is 14 m.

export const floors = pgTable(
  "floors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // -1 basement, 0 ground floor, 1 first floor…
    level: integer("level").notNull().default(0),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("floors_restaurant_idx").on(t.restaurantId)],
);

/** A named area of a floor: a room, the terrace, a private corner. Tables inside it belong to it. */
export const zones = pgTable(
  "zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
  },
  (t) => [index("zones_restaurant_idx").on(t.restaurantId)],
);

export const fixtureKind = pgEnum("fixture_kind", [
  "wall",
  "door",
  "window",
  "kitchen",
  "bar",
  "cash",
  "stairs",
  "toilets",
  "column",
  "plant",
  "entrance",
  "station",
  "other",
]);

/** Everything on the plan that isn't a table: walls, doors, kitchen, till, stairs… */
export const fixtures = pgTable(
  "fixtures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    kind: fixtureKind("kind").notNull(),
    label: text("label").notNull().default(""),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
    // Degrees clockwise around the centre.
    rotation: integer("rotation").notNull().default(0),
  },
  (t) => [index("fixtures_restaurant_idx").on(t.restaurantId)],
);

export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    // Derived from position when the plan is saved: the zone the table's centre sits in.
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    // The most people it seats.
    seats: integer("seats").notNull(),
    // The fewest people it's given to online, so a couple doesn't take an 8-top.
    minCovers: integer("min_covers").notNull().default(1),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    shape: tableShape("shape").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
    // Degrees clockwise around the centre.
    rotation: integer("rotation").notNull().default(0),
  },
  (t) => [index("dining_tables_restaurant_idx").on(t.restaurantId)],
);

/** Tables that can be pushed together for a bigger party, e.g. T6 + T7 for up to 14. */
export const tableCombinations = pgTable(
  "table_combinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    minCovers: integer("min_covers").notNull(),
    maxCovers: integer("max_covers").notNull(),
    bookableOnline: boolean("bookable_online").notNull().default(true),
  },
  (t) => [index("table_combinations_restaurant_idx").on(t.restaurantId)],
);

export const combinationTables = pgTable(
  "combination_tables",
  {
    combinationId: uuid("combination_id")
      .notNull()
      .references(() => tableCombinations.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.combinationId, t.tableId] })],
);

/**
 * An area closed for one day (the terrace when it rains). By name, not zone id: a room drawn as several
 * areas with the same name closes as one, and zone ids change every time the plan is saved.
 */
export const zoneClosures = pgTable(
  "zone_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    zoneName: text("zone_name").notNull(),
    date: date("date", { mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("zone_closures_unique_idx").on(t.restaurantId, t.zoneName, t.date)],
);

// How a consent was given: ticked online by the guest, recorded by staff after asking, or from the guest's
// private link.
export const consentSource = pgEnum("consent_source", ["online", "staff", "guest_link"]);

/**
 * A guest of one restaurant, built up booking after booking — only if the guest agreed to be remembered. Matched by normalised phone or by email, so the
 * same person booking online and by phone is one profile. Belongs to the restaurant, never shared.
 */
export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Normalised: "+393331234567". Empty when unknown.
    phone: text("phone").notNull().default(""),
    // Lower-case. Empty when unknown.
    email: text("email").notNull().default(""),
    allergies: text("allergies").notNull().default(""),
    // Staff notes that follow the guest to every booking.
    notes: text("notes").notNull().default(""),
    vip: boolean("vip").notNull().default(false),
    // "MM-DD", empty when unknown.
    birthday: text("birthday").notNull().default(""),
    anniversary: text("anniversary").notNull().default(""),
    // When the guest agreed to be remembered. Null: no consent (a profile from before consent existed),
    // which the app keeps switched off until consent is recorded or the profile is deleted.
    profileConsentAt: timestamp("profile_consent_at", { withTimezone: true }),
    profileConsentSource: consentSource("profile_consent_source"),
    // Agreed to receive offers and news from the restaurant. Separate from the profile, never assumed.
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guests_restaurant_idx").on(t.restaurantId),
    index("guests_phone_idx").on(t.restaurantId, t.phone),
    index("guests_email_idx").on(t.restaurantId, t.email),
  ],
);

export const consentKind = pgEnum("consent_kind", ["profile", "marketing"]);
export const consentAction = pgEnum("consent_action", ["granted", "withdrawn"]);

/**
 * Every consent given or withdrawn, with the exact wording the guest saw: GDPR asks the restaurant to be able
 * to show when and how each guest agreed. Deleted with the guest.
 */
export const consentLog = pgTable(
  "consent_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    kind: consentKind("kind").notNull(),
    action: consentAction("action").notNull(),
    source: consentSource("source").notNull(),
    wording: text("wording").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_log_guest_idx").on(t.guestId)],
);

/**
 * One-time links emailed to a guest so they can see, download or delete what a restaurant keeps about them.
 * Only the hash is stored; links expire after a day.
 */
export const guestTokens = pgTable("guest_tokens", {
  id: text("id").primaryKey(),
  guestId: uuid("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const waitlistStatus = pgEnum("waitlist_status", ["waiting", "notified", "seated", "left"]);
export const waitlistSource = pgEnum("waitlist_source", ["door", "online"]);

/**
 * People waiting for a table: walk-ins at the door (today), or guests who found a day full online and want
 * an email if something frees up.
 */
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    partySize: integer("party_size").notNull(),
    notes: text("notes").notNull().default(""),
    source: waitlistSource("source").notNull(),
    status: waitlistStatus("status").notNull().default("waiting"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("waitlist_restaurant_date_idx").on(t.restaurantId, t.date)],
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
    // Set instead of tableId when the party sits at joined tables.
    combinationId: uuid("combination_id").references(() => tableCombinations.id, { onDelete: "set null" }),
    // The guest's profile, matched by phone or email. Null for walk-ins without contact details.
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    // When the guest tapped "Ci sarò" in the reminder.
    guestConfirmedAt: timestamp("guest_confirmed_at", { withTimezone: true }),
    // Secret in the guest's link to view or cancel the booking without an account.
    manageToken: text("manage_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reservations_restaurant_date_idx").on(t.restaurantId, t.date),
    // For the "has anything changed?" check behind live updates.
    index("reservations_restaurant_updated_idx").on(t.restaurantId, t.updatedAt),
  ],
);

export type Restaurant = typeof restaurants.$inferSelect;
export type ServiceHour = typeof serviceHours.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type DiningTable = typeof diningTables.$inferSelect;
export type Floor = typeof floors.$inferSelect;
export type Zone = typeof zones.$inferSelect;
export type Fixture = typeof fixtures.$inferSelect;
export type FixtureKind = (typeof fixtureKind.enumValues)[number];
export type TableCombination = typeof tableCombinations.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];
