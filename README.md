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
| `/app/sala/modifica` | Draw the restaurant: **floors** (with their size in metres), **rooms and areas** on each floor (each open or closed to online booking; several areas with the same name make one room of any shape), **fixed elements** (walls, doors, windows, entrance, kitchen, bar, till, service station, stairs, toilets, columns, plants) and **tables** at real size and any angle, with a minimum and maximum number of people and an online on/off switch. **Joined tables**: groups of tables pushed together for bigger parties, with their own people range. Drag to move, corner handle to resize, undo/redo, zoom, or start from a two-floor example. |
| `/app/sala` | The room live, floor by floor: seated, arriving within 30 minutes, late, free, and each table's next booking; parties at joined tables show on every table of the group. Drag the time slider to see any moment of the day. Close an area to online booking for one day (the terrace when it rains). |

From the floor view staff can seat a booking, mark a table as left, seat walk-ins on a free table, move a booking to another
table, and assign bookings without a table by hand or automatically (smallest free table that fits). A table can never be
double-booked. The booking list and the floor view update by themselves within a few seconds when anything changes,
on any device (`LiveSync` checks a cheap fingerprint every 4 s and reloads only on change). Menu pages are prefetched,
so switching between them is instant.

**Online bookings use the plan.** Once a restaurant has drawn its tables, a time is offered online only if a table open to
online booking (in an area open online that day, and in the area the guest chose, if any) suits the party size and is free
for the whole stay, after seating everyone already booked. Bigger parties get joined tables, but only when no single table
fits. The table (or joined tables) is assigned at booking time. Restaurants that haven't drawn their
room are booked by the total seat count from the settings.

The rules for table states, assignment and online table availability are in `src/lib/floor.ts`.

**How availability works** (`src/lib/availability.ts`): a time is bookable online if, for the whole length of the stay,
the people already seated plus the new party fit in the room's seats, the optional "max arrivals per slot" isn't exceeded,
it respects the minimum notice and booking window, and the day isn't a closure.

### Stage 3, "Ospiti": guests, waitlist, reminders

| Page | What it does |
|---|---|
| `/app/ospiti` | Guests who chose to be remembered (see Privacy below); the same person typing their number differently ("333 123 4567", "+39 333-1234567") is one profile. Search, and export everything as CSV, consent dates included. |
| `/app/ospiti/senza-consenso` | Profiles made before consent was asked: switched off until staff record the guest's yes on the profile, or delete them (one by one or ticked in bulk). Nothing here is deleted automatically. |
| `/app/ospiti/<id>` | Visits, no-shows, cancellations, usual party size, booking history; allergies, standing notes, birthday, anniversary, VIP. Delete on request (GDPR): the profile goes and the bookings keep only the numbers. |

- **Privacy (GDPR)**: a profile exists only if the guest says yes. Online, "Ricordati di me" is an unticked box, with an optional
  second box for offers; staff tick the same boxes when the guest agrees on the phone. Every yes and no is logged with the date,
  who recorded it, and the exact wording shown. Without a yes, the booking works normally and no profile is made. Later, from
  their booking page, a guest can opt in, or ask for a private link (sent only to the email on their profile, valid 24 hours)
  to see, download (JSON), stop offers or delete everything kept about them. Privacy notice at `/p/<restaurant>/privacy`.
  The morning job also cleans up: bookings without a profile lose name, contacts and notes after 12 months; profiles with no
  booking in 24 months are deleted (`RETENTION` in `src/lib/consent-wording.ts`).
- **On every booking** (list and room view): "Nuovo" or "5ª visita", no-shows, VIP, birthday or anniversary that day, allergies in red, the guest's standing notes.
- **Waitlist**: walk-ins added at the door with how long they've waited, "Chiama", "Avvisa", and "Fai sedere" by tapping a free table. Online, a guest who finds a day full can ask to be emailed; any cancellation or no-show emails the waiting guests whose party now fits, with a link to that day.
- **Reminders**: every morning (Vercel Cron, `vercel.json`) guests booked for tomorrow get an email to confirm ("Ci sarò") or cancel; staff see "Ci sarà". One reminder per booking, none for bookings made in the last two hours. On/off in settings, plus a button to send them now.

### Team and accounts

| Page | What it does |
| --- | --- |
| `/app/team` | Invite people by email as **Responsabile** (everything but the account and other managers) or **Sala** (bookings, room, waitlist, guests; no settings, no export, no deleting guests). Change roles, remove someone (their access ends at once), hand the restaurant over to a manager. A manager can only add or remove Sala staff. |
| `/team/<restaurant>` | The restaurant's own staff login page, to bookmark on the room's tablet or a waiter's phone. |
| `/invito/<code>` | Accept an invitation (valid 7 days): pick a name and password, or use an existing Coperto password if already on another team. |
| `/app/account` | Name, password (changing it logs out other devices), switch between restaurants, leave a team. The owner downloads all the restaurant's data (JSON) and can delete the restaurant: password plus its name typed out; accounts of people on no other team go too. |
| `/password-dimenticata` | Emails a one-hour, single-use link to set a new password. Same answer whatever the email, so it doesn't reveal who has an account. |
| `/termini`, `/privacy`, `/cookie`, `/dpa` | Terms of Service, Coperto's privacy policy, cookie policy, and the data processing agreement (GDPR art. 28). Accepted at signup; existing owners get a banner to accept. Company details to fill in: `src/lib/legal.ts`. |

**Room tablet with PINs.** On the Team page an owner or manager taps "Usa questo dispositivo come tablet della sala": that
browser becomes the restaurant's tablet (a year-long cookie; revocable from the Team page). On it, `/sala` shows "Chi sei?":
tap your name, type your 6-digit PIN. It locks after 5 minutes without touches or with "Blocca". PINs work only on authorised
tablets; 5 wrong tries lock that PIN for 15 minutes; weak PINs (111111, 123456) are refused. Staff can be added without an
email ("Aggiungi senza email"): they get a generated PIN, shown once, and their account is deleted when removed from the
team. On the tablet the owner works as a manager (no deleting or exporting the restaurant). Anyone can set their own PIN in
"Il mio account"; owners and managers can issue a new one ("Nuovo PIN"), which also unlocks it.

Every booking entered by staff records who entered it ("Inserita da Luca").

### Subscriptions (Stripe)

14 days free without a card, then Banco (19,99 €/month) or Sala (39,99 €/month), or yearly with two months free, all
plus 22% IVA. The owner picks a plan and enters invoice details (ragione sociale, P.IVA, sede, codice SDI or PEC) at
`/app/abbonamento`, pays on Stripe's page, and later manages card, plan, invoices and cancellation from Stripe's portal.
Prices and the IVA rate are created in Stripe automatically on first use. Subscribing during the trial saves the card;
the first charge comes when the trial ends.

- **Soft block**: when the trial or the subscription ends, online bookings pause (guests see bookings closed) and the app
  shows a banner; staff keep working and nothing is deleted. A failed payment keeps everything running while Stripe
  retries, with an email and a banner for the owner.
- **Banco** hides the floor plan and guest profiles (and "Ricordati di me"); Sala has everything.
- Emails 3 days before the trial ends and when it ends (morning job).
- Stripe's invoices are not Italian e-invoices: connect an e-invoicing service to Stripe, or give the accountant the
  payments CSV from the admin panel (it has the SDI/PEC details).

Stripe setup: create the account, then in **Developers → Webhooks** add an endpoint `https://<your-site>/api/stripe/webhook`
with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`; put its signing secret and your secret key in
Vercel. In **Settings → Billing → Customer portal**, save the default settings once (and allow switching between the four prices).

### Admin panel (Coperto's own back office)

`/admin`, for the Coperto accounts whose email is in `ADMIN_EMAILS` (an "Admin" button appears in their app header).
Everyone else, and any room tablet, gets "page not found".

| Page | What it shows |
| --- | --- |
| Panoramica | Restaurants (total, new in 7/30 days, active in 7 days), users, bookings today and this month (online share), guest profiles, applications, latest signups |
| Ristoranti | Searchable list (name, city, address, owner email) with team, tables, bookings, last booking, flags; each opens a read-only detail: owner, settings, team and PINs, tablets, opening hours, recent bookings |
| Utenti | Everyone with a login or a PIN, their restaurants and roles; send a password-reset link |
| Candidature | Applications from "Lavora con noi": read, download CV, delete |
| Sistema | Database, email, app URL, cron secret, careers email: configured or not, with what to do |
| Registro | Every restaurant opened, CV downloaded, link sent or application deleted, by whom and when |

Admins don't need a restaurant. First time: open `/admin-accesso`, type an email listed in `ADMIN_EMAILS`, and follow the
emailed link to choose a password (the email proves the address is yours, so nobody can claim it). After that, log in
from the normal "Accedi" page: you land in the panel. An admin who also owns a restaurant gets an "Admin" button in the
app instead, and deleting that restaurant never deletes an admin's login.

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

1. **Database**: in your Vercel project open **Storage → Create Database → Supabase**, choose the *Ireland (eu-west-1)* region
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
| `CRON_SECRET` | Any long random text: only Vercel's morning job can then trigger reminders and the privacy cleanup |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` while testing, `sk_live_…` for real): subscriptions and payments |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook pointing at `https://<your-site>/api/stripe/webhook` (`whsec_…`) |
| `CAREERS_EMAIL` | Where applications from "Lavora con noi" are emailed, CV attached (optional: they're also saved) |
| `ADMIN_EMAILS` | Comma-separated emails of Coperto accounts that may read applications at `/admin/candidature` |

The app reads the database address from `DATABASE_URL`, or from `POSTGRES_URL` as set by Vercel's Supabase and Neon integrations.
Without any of the email variables, emails are written to Vercel's logs instead of being sent.

Every deploy applies database changes automatically before building.

**Is it slow?** Open `/api/diagnostica` on your deployment: it shows the region the server runs in and how long one
database round trip takes. Every page makes a few, so anything above ~40 ms means the server and database are far
apart: put them in the same region.

The app's server code runs in Vercel's Dublin region (`regions` in `vercel.json`), next to a Supabase project in
Ireland (`eu-west-1`). If your database is in another region, change `dub1` to the nearest
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
