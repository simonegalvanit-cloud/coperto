# Coperto

Reservations and floor management for Italian restaurants. Flat monthly fee, no per-cover commissions.

## What works today

### Stage 1, "Banco": online bookings

| Who | Page | What it does |
|---|---|---|
| Visitors | `/` | The marketing landing page (`public/landing.html`) |
| Restaurant owner | `/registrati`, `/accedi` | Sign up and log in. Sign-up creates the restaurant with a default week (closed Monday, lunch and dinner otherwise). |
| Restaurant staff | `/app` | The day's bookings grouped by service, cover totals, one-tap status: seated, left, no-show, cancelled |
| Restaurant staff | `/app/nuova` | Add a phone or walk-in booking (no capacity limit, staff decides) |
| Restaurant owner | `/app/impostazioni` | Booking link and website widget code, opening hours, seats, booking rules, closure days, restaurant details |
| Guests | `/p/<restaurant>` | Public booking page: party size → day → time → details. Add `?embed=1` for the website widget. |
| Guests | `/p/<restaurant>/prenotazione/<code>` | Confirmation page with a cancel button (linked from the confirmation email) |

Emails go out on every new booking (to guest and restaurant) and on every cancellation.

### Stage 2, "Sala": the restaurant's real layout, live

| Page | What it does |
|---|---|
| `/app/sala/modifica` | Draw the restaurant: **floors** (with their size in metres), **rooms and areas** on each floor (each open or closed to online booking), **fixed elements** (walls, doors, windows, entrance, kitchen, bar, till, service station, stairs, toilets, columns, plants) and **tables** at real size with a minimum and maximum number of people and an online on/off switch. Drag to move, corner handle to resize, undo/redo, zoom, or start from a two-floor example. |
| `/app/sala` | The room live, floor by floor: seated, arriving within 30 minutes, late, free, and each table's next booking. Drag the time slider to see any moment of the day. |

From the floor view staff can seat a booking, mark a table as left, seat walk-ins on a free table, move a booking to another
table, and assign bookings without a table by hand or automatically (smallest free table that fits). A table can never be
double-booked. The booking list and the floor view refresh themselves every 15 seconds.

**Online bookings use the plan.** Once a restaurant has drawn its tables, a time is offered online only if a table open to
online booking (in an open area, and in the area the guest chose, if any) suits the party size and is free for the whole
stay, after seating everyone already booked. The table is assigned at booking time. Restaurants that haven't drawn their
room are booked by the total seat count from the settings.

The rules for table states, assignment and online table availability are in `src/lib/floor.ts`.

**How availability works** (`src/lib/availability.ts`): a time is bookable online if, for the whole length of the stay,
the people already seated plus the new party fit in the room's seats, the optional "max arrivals per slot" isn't exceeded,
it respects the minimum notice and booking window, and the day isn't a closure.

## Try it on your computer

You need [Node.js 22](https://nodejs.org). Then, in this folder:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000/registrati. Locally the app uses a built-in database stored in the `.data/` folder,
and emails are printed in the terminal instead of being sent.

## Put it online

1. **Database**: in your Vercel project open **Storage → Create Database → Supabase**, choose the *Frankfurt* region
   and connect it to all environments. Vercel adds the database address by itself.
   (Or create the project on [supabase.com](https://supabase.com) and add its *Transaction pooler* connection string
   as `DATABASE_URL`.)
2. **Email** (optional at first): create a free account on [Resend](https://resend.com), verify your domain, create an API key.
3. **Hosting**: in the Vercel project add these environment variables when you're ready for email:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | The Resend API key |
| `EMAIL_FROM` | e.g. `Coperto <prenotazioni@tuodominio.it>` |
| `APP_URL` | Your public address, e.g. `https://coperto.it` |

The app reads the database address from `DATABASE_URL`, or from `POSTGRES_URL` as set by Vercel's Supabase and Neon integrations.
Without any of the email variables, emails are written to Vercel's logs instead of being sent.

Every deploy applies database changes automatically before building.

The app's server code runs in Vercel's Frankfurt region (`regions` in `vercel.json`), next to a Supabase project in
Frankfurt (`eu-central-1`). If your database is in another region, change `fra1` to the nearest
[Vercel region](https://vercel.com/docs/regions): every page makes a few database round trips, so distance adds up fast.

## For developers

- Next.js 16 (App Router, server actions), TypeScript, Drizzle ORM on Postgres (PGlite locally)
- `npm test`: unit tests for the availability and floor-plan rules
- `npm run lint`, `npm run typecheck`
- After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
- Every staff query is scoped to the logged-in restaurant via `requireAccount()` (`src/lib/auth.ts`).

## Next stages

3. **Ospiti**: guest profiles, WhatsApp reminders, waitlist
4. **Revenue**: Stripe subscriptions, deposits and card guarantees
