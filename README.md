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

### Stage 2, "Sala": the live floor plan

| Page | What it does |
|---|---|
| `/app/sala/modifica` | Draw the room: add tables from presets (or start from an example room), drag them into place, set name, seats and shape |
| `/app/sala` | The room live: seated, arriving within 30 minutes, late, free, and each table's next booking. Drag the time slider to see any moment of the day. |

From the floor view staff can seat a booking, mark a table as left, seat walk-ins on a free table, move a booking to another
table, and assign bookings without a table by hand or automatically (smallest free table that fits). A table can never be
double-booked. The booking list and the floor view refresh themselves every 15 seconds.

The rules for table states and automatic assignment are in `src/lib/floor.ts`.

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

1. **Database**: create a free project on [Supabase](https://supabase.com) in the *Frankfurt (eu-central-1)* region.
   In *Connect → Transaction pooler* copy the connection string.
2. **Email**: create a free account on [Resend](https://resend.com), verify your domain, create an API key.
3. **Hosting**: import this GitHub repository on [Vercel](https://vercel.com) and set these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Supabase connection string |
| `RESEND_API_KEY` | The Resend API key |
| `EMAIL_FROM` | e.g. `Coperto <prenotazioni@tuodominio.it>` |
| `APP_URL` | Your public address, e.g. `https://coperto.it` |

Every deploy applies database changes automatically before building.

## For developers

- Next.js 16 (App Router, server actions), TypeScript, Drizzle ORM on Postgres (PGlite locally)
- `npm test`: unit tests for the availability and floor-plan rules
- `npm run lint`, `npm run typecheck`
- After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
- Every staff query is scoped to the logged-in restaurant via `requireAccount()` (`src/lib/auth.ts`).

## Next stages

3. **Ospiti**: guest profiles, WhatsApp reminders, waitlist
4. **Revenue**: Stripe subscriptions, deposits and card guarantees
