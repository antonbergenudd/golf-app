# Agent instructions

## Completion checklist

Before considering a task complete:

- Fix new linter and TypeScript issues introduced by the change.
- When the change affects runtime UI (web or native), verify the relevant screen or flow and resolve new **console errors** and **warnings** caused by the change (including accessibility warnings such as `aria-hidden` / focus issues on web).
- If a warning comes from a dependency, framework noise, or is intentionally deferred, note it briefly and why.
