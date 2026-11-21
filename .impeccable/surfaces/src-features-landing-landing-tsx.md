---
version: 1
slug: "src-features-landing-landing-tsx"
primary_target: "src/features/landing/Landing.tsx"
related_targets: []
---

# Landing (showcase)

Scope: public landing page shown before sign-in, inside the React app. Visitor mode: Persuade.
Audience: developers, reviewers and peers viewing Kingslock as a portfolio piece.
Action: view the source on GitHub (primary); Owner sign-in (secondary, quiet).
Proof: real WebCrypto ciphertext generated on the page; real RPC names, error codes and KDF parameters from the codebase. No invented users, stars, audits or benchmarks.
Constraints: strict CSP (self-hosted fonts, no third-party scripts), English copy, GLOSSARY vocabulary.

## Direction contract

THESIS: The page is a breach attempt you run yourself. The category ships a shield, a headline and a feature grid; this page hands the visitor a terminal and lets every attack come back as ciphertext or a database refusal.

OWN-WORLD: Green-phosphor CRT on true black. Phosphor green for output, dim green for chrome, red only for DENIED, amber only for honest warnings. VT323 display, JetBrains Mono for every line of output. Every frame and rule is drawn in box-drawing glyphs: ┌─┐│└┘ frames with ├─┤ section joins (terminal, diagram, clone line), ─ runs for section rules, table rows and list rows (user, 2026-11-21: "pakai box-drawing untuk bingkainya"). Interactive controls (buttons, chips) keep 1px strokes. No cards, no rounded corners, no box shadows; glow lives only in display text-shadow. Red only for refusals inside the terminal.

STORY: Visitors see they can attack the vault, try it, learn the server only holds ciphertext and that Postgres (not React) says no, then read the key chain, threat model, decisions and honest limits, then clone the repo.

FIRST VIEWPORT: Left, VT323 headline at display scale with one line of plain explanation and the GitHub action. Right, a live terminal occupying most of the height, with clickable attack commands; the first command auto-runs once on load (still under reduced motion).

FORM: seed:c6f6acb3fb8c2165. The user's pin "buat seperti hacker hacker cyber" overrides the rolled world only; the first-surface experience (self-run breach terminal) was derived, not pinned.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Parked alternates

- Intaglio Security Note (user liked it, kept for later): banknote and passport security printing, guilloché rosette generated from real ciphertext, security-features legend mapping threat to mitigation. Palette #D9E4D8 #1F332C #5D4FA0 #3F8178 #EE6A2C. Sketch: .impeccable/parked/intaglio-security-note.html
