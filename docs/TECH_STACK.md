# Tech stack

This document records the intended tools for **golf-app** so the whole team (and AI assistants) share the same baseline.

## Mobile: Expo + React Native

- **Expo** manages the native runtime, dev client, builds, and OTA updates workflow.
- **React Native** is the UI framework; components live in `App.tsx` and will grow under `components/` or `src/` as the app scales.

**Run locally:** `npm start` from the project root, then open iOS/Android/Web from the CLI or Expo Dev Tools.

## Styling: NativeWind

- **NativeWind** brings [Tailwind CSS](https://tailwindcss.com)-style utility classes to React Native (`className` on views and text).
- Global Tailwind entry: `global.css`. Tailwind config: `tailwind.config.js`. Metro is wrapped with NativeWind in `metro.config.js`.

**Docs:** [nativewind.dev](https://www.nativewind.dev/)

## Backend: Supabase

- **Supabase** provides Postgres, auth, storage, and realtime APIs with a generous free tier.
- The app includes `@supabase/supabase-js` and a thin client in `lib/supabase.ts`.
- Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). Never commit real secrets.

**Docs:** [supabase.com/docs](https://supabase.com/docs)

## AI-assisted development: Cursor + v0

| Tool | Role |
|------|------|
| **Cursor** | IDE with AI coding agent for implementation, refactors, and repo-wide edits. This repo is meant to be opened in Cursor. |
| **v0** | UI generation and rapid prototyping of React/React Native-style layouts; export or adapt output into this codebase. |

These are workflow choices, not npm packages. No version pins apply.

---

*Last aligned with project bootstrap: May 2026.*
