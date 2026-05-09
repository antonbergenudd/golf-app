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

After copying `.env.example` to `.env`, add your Supabase URL and anon key when you connect the backend.

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## Documentation

- **Stack overview:** [`docs/TECH_STACK.md`](docs/TECH_STACK.md)

## Tech stack (summary)

| Area | Choice |
|------|--------|
| Mobile | Expo + React Native |
| Styling | NativeWind (Tailwind for RN) |
| Backend | Supabase |
| AI workflow | Cursor + v0 |
