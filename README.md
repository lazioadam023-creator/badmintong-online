# BADMINGTONG V1 Online — Starter

Starter migration from the approved local prototype to Next.js + Supabase.

## Before starting
- Windows laptop
- Node.js 20.9+ (LTS recommended)
- VS Code
- Supabase account
- Vercel account later for deployment

## Stage 1 — Create Supabase project
1. Go to https://supabase.com/dashboard and create a project.
2. Save the database password somewhere safe.
3. Open SQL Editor → New query.
4. Paste all of `supabase/schema.sql` and click Run.
5. In Authentication → Users, create your Owner user with your own email and a strong password.
6. Copy that user's UUID.
7. In SQL Editor run:
   ```sql
   insert into public.owner_profiles(user_id,is_owner)
   values ('PASTE_OWNER_USER_UUID_HERE', true);
   ```
8. In Table Editor → settings, replace bank account, holder, GoPay number and WhatsApp number with the real details. Do not use placeholders for launch.

## Stage 2 — Configure local project
1. Install Node.js 20.9 or newer: https://nodejs.org/
2. Install VS Code: https://code.visualstudio.com/
3. Extract this ZIP.
4. Open the extracted `BADMINGTONG_Online_Starter` folder in VS Code.
5. Copy `.env.example` to `.env.local`.
6. In Supabase Project Settings → API, copy Project URL and anon/publishable key into `.env.local`.
   - NEXT_PUBLIC_SUPABASE_URL=...
   - NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   Never put a service_role/secret key in a NEXT_PUBLIC variable or commit it.
7. Open VS Code Terminal and run:
   ```bash
   npm install
   npm run dev
   ```
8. Open http://localhost:3000

## Stage 3 — Important security work before public launch
This is an implementation starter, not a production-certified payment system.
- The public booking RPC uses a session row lock to protect capacity and expires old HOLDs before counting capacity.
- Public view reveals only confirmed names; it does not expose phone numbers.
- Owner access is Supabase Auth + owner_profiles.
- Bukti pembayaran menggunakan private Storage bucket. Policy membolehkan upload hanya ke folder UUID booking yang masih HOLD dan belum expired; hanya Owner dapat membaca file melalui signed URL. Uji policy ini di project Supabase sebelum go-live.
- Add a scheduled Supabase Cron job to expire HOLDs, although the booking RPC also expires them on the next booking attempt.
- Add rate limiting / CAPTCHA to the public hold RPC.
- Add Owner UI for creating/editing sessions and updating settings; current starter includes verification and the homepage flow skeleton.
- Test with two separate browsers simultaneously to verify last-slot contention.

## Stage 4 — Deploy
1. Push project to GitHub (do not upload `.env.local`).
2. In Vercel choose Add New → Project and import the repository.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel Environment Variables.
4. Deploy.
5. In Supabase Authentication → URL Configuration, add the Vercel URL to Site URL and Redirect URLs.
6. Test public booking and Owner login on a second device.

## Known scope in this starter
The initial Next.js scaffold includes the dark/cyan/gold home concept, public member booking, 10-minute server hold, payment instructions, proof upload to a private bucket, Owner login, signed proof viewing, and manual verification structure. It is deliberately not marked production-ready until secure proof upload, owner session/settings management, expiry scheduling, and end-to-end tests are completed.

## Capacity update — 22 players
The default capacity for new sessions is 22 players. If you already ran the earlier SQL seed, update the existing upcoming session capacity in Supabase Table Editor → sessions → capacity = 22 (or run `update public.sessions set capacity = 22 where status = 'OPEN';` only if you intend every currently open session to have 22 slots).

## Database setup walkthrough
1. In the Supabase project, open SQL Editor → New query.
2. Open `supabase/schema.sql` from this ZIP in VS Code or Notepad.
3. Copy the entire file and paste it into the SQL Editor.
4. Click Run once and wait for “Success”.
5. Do not run it repeatedly: the starter schema uses named policies that are created once.
6. If the editor reports an error, stop and share the exact error text/screenshot before trying random fixes.
