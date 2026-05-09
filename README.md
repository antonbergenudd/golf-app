# golf-app

Cross-platform mobile app built with the stack documented in [`docs/TECH_STACK.md`](docs/TECH_STACK.md).

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Expo Go](https://expo.dev/go) on a device or simulator for quick iteration

## Setup

```bash
npm install
# Copy env template (Unix: cp .env.example .env — Windows CMD: copy .env.example .env)
npm start
```

After copying `.env.example` to `.env`, add your Supabase URL and anon key.

## Database

Create your Supabase project, then run the SQL in `supabase/migrations/20260509140000_init.sql` in the Supabase SQL Editor (tables, permissive dev RLS policies, and realtime publication). Replace those policies with auth-aware rules before production.

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

The app uses **file-based routing** via Expo Router (`app/` directory); `npm start` boots Metro as before.

## Documentation

- **Stack overview:** [`docs/TECH_STACK.md`](docs/TECH_STACK.md)

## Tech stack (summary)

| Area | Choice |
|------|--------|
| Mobile | Expo + React Native |
| Styling | NativeWind (Tailwind for RN) |
| Backend | Supabase |
| AI workflow | Cursor + v0 |
