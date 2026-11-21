# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Owner**: the single person who uses the vault day to day. There is no public sign-up; the database refuses a second Vault.
- **Showcase visitor** (landing page audience, confirmed 2026-11-21): developers, reviewers and peers looking at Kingslock as a portfolio piece. They want to understand what was built, how the security model works, and what decisions were made, then go to the repository or docs.

## Product Purpose

A self-hosted, single-owner password manager. Every Vault field (Platform name, Login Identity, password, notes) is encrypted in the browser before it reaches Supabase, so a leaked database, backup or dashboard reveals nothing. Success is that the server never holds anything readable, and every sensitive action is gated by a fresh 2FA code that the database itself enforces.

## Positioning

Zero-knowledge encryption plus step-up 2FA enforced in Postgres (RLS and `security definer` RPCs), not in the UI. One Master Password is split into an auth key and an encryption key, so Supabase Auth never sees the real password. Secrets are readable only through an RPC that always writes to the Activity Log. Built for exactly one person, on purpose.

## Operating Context

- Vault app: sign in with email, Master Password and a TOTP code; Platforms dashboard; Credentials table; settings for 2FA devices, Master Password change, encrypted export/import, auto-lock and Activity Log.
- Landing page lives inside the same React app (shown before sign-in) and is subject to the same strict CSP: no third-party scripts, no CDN, fonts bundled.
- Architecture decisions are documented in `docs/adr/0001` to `0006`; technical handoff in `HANDOFF.md`; domain language in `GLOSSARY.md`.

## Capabilities and Constraints

- Crypto chain: Argon2id (salt derived from email) → HKDF → authKey + encKey (AES-KW) → unwraps a random Vault Key (AES-GCM 256, AAD bound to row id).
- Mandatory TOTP with at least two 2FA Devices (replaces recovery codes).
- Step-up verification for view, edit, delete, export, with a 2-minute Grace Window, enforced in the database.
- Auto-lock (1/5/15 min); refresh or closing the tab locks the Vault; nothing stored in browser storage.
- Append-only Activity Log.
- Password generator (20 chars default, `crypto.getRandomValues`, no modulo bias); Previous Password kept on change; duplicate warnings.
- Master Password cannot be reset. Losing it means losing the Vault, by design.
- Known limits: single owner only; TOTP replay within a code's lifetime; Master Password change is not atomic; failed logins are not logged; no protection against malware on the Owner's device.
- Stack: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, Supabase, WebCrypto, hash-wasm, zxcvbn-ts, Vitest, oxlint, Cloudflare Pages.
- Repository: https://github.com/mazc0de/kingslock
- UI language: English. Landing page copy: English.

## Brand Commitments

- Name: Kingslock.
- Domain vocabulary from `GLOSSARY.md` is binding: Owner, Vault, Platform, Credential, Login Identity, Master Password, Vault Key, 2FA Device, Step-up Verification, Grace Window, Activity Log, Export Vault.
- No logo exists yet (`public/favicon.svg` is the Vite default and is not a brand asset).

## Evidence on Hand

- Real: the codebase, six ADRs, README, HANDOFF threat model, SQL/RLS tests, crypto unit tests.
- Absent: no users, testimonials, metrics, audits, stars or press. Do not fabricate any. No third-party security audit has been done.

## Product Principles

1. The server is never trusted with anything readable.
2. Rules live in the database, not in the UI.
3. One owner, no recovery backdoor: honesty about the trade-offs is part of the product.
4. Minimal surface: no third-party scripts, pinned dependencies, strict CSP.

## Accessibility & Inclusion

No product-specific requirement established beyond WCAG AA basics.
