---
name: Kingslock
description: Landing world for a zero-knowledge, single-owner password vault. Green phosphor on true black.
colors:
  void-black: "#000000"
  screen-black: "#010904"
  phosphor-green: "#3dff7a"
  phosphor-text: "#b9f3cc"
  phosphor-muted: "#72c08e"
  phosphor-trace: "#3f8f5c"
  phosphor-line: "#1c5532"
  phosphor-frame: "#26743f"
  command-white: "#e6ffee"
  refusal-red: "#ff5d55"
  caution-amber: "#ffb547"
typography:
  display:
    fontFamily: "VT323, ui-monospace, monospace"
    fontSize: "clamp(3.5rem, 7vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "VT323, ui-monospace, monospace"
    fontSize: "clamp(2.6rem, 4.4vw, 4rem)"
    fontWeight: 400
    lineHeight: 0.92
  close:
    fontFamily: "VT323, ui-monospace, monospace"
    fontSize: "clamp(3rem, 6.5vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.92
  wordmark:
    fontFamily: "VT323, ui-monospace, monospace"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
  lede:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
  small:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.6
  diagram:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "clamp(11px, 1.15vw, 15px)"
    lineHeight: 1.55
  diagram-tablet:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "clamp(11px, 2.4vw, 15px)"
    lineHeight: 1.55
  diagram-phone:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "clamp(9px, 2.55vw, 14px)"
    lineHeight: 1.55
  terminal:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  none: "0px"
spacing:
  gutter: "56px"
  gutter-tablet: "32px"
  gutter-phone: "16px"
  section-y: "112px"
  column-gap: "64px"
components:
  button-primary:
    backgroundColor: "{colors.phosphor-green}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
  button-primary-hover:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.phosphor-green}"
  button-ghost:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.phosphor-green}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
  command-chip:
    backgroundColor: "{colors.screen-black}"
    textColor: "{colors.phosphor-green}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "7px 11px"
  command-chip-hover:
    backgroundColor: "{colors.phosphor-green}"
    textColor: "{colors.void-black}"
  terminal:
    backgroundColor: "{colors.screen-black}"
    textColor: "{colors.phosphor-text}"
    typography: "{typography.terminal}"
    rounded: "{rounded.none}"
---

# Design System: Kingslock

Scope: the public landing page (`src/features/landing/`, classes prefixed `kl-`). The vault app itself (Operate screens behind sign-in) still runs on stock shadcn/ui neutral tokens in `src/index.css`. That system was not changed by this build and is not described here.

## Overview

**Creative North Star: "The Breach Lab"**

The page is a terminal session the visitor runs against the vault. Every surface is a CRT screen on true black, and every claim is shown as output, never asserted as a slogan: real ciphertext, verbatim Postgres error codes, real KDF parameters. Display type glows; everything else is quiet, monospaced and exact.

**Key Characteristics:**
- True black ground with green phosphor as the single working colour.
- VT323 for display only; JetBrains Mono for every line a person reads.
- Box-drawing glyphs for every frame and rule; only buttons and chips keep 1px strokes.
- No cards, no radius, no box shadows.
- Red and amber only carry meaning: refusal and honest warning.

## Colors

### Primary
- **Phosphor Green** (#3dff7a): display type, links, primary button fill, prompts, success lines.

### Neutral
- **Void Black** (#000000): page ground. Never a tinted near-black.
- **Screen Black** (#010904): the inside of terminals, the diagram and the clone line.
- **Phosphor Text** (#b9f3cc): body copy and terminal output.
- **Phosphor Muted** (#72c08e): secondary text, table headers, quiet links (about 9:1 on black).
- **Phosphor Trace** (#3f8f5c): connector strokes inside diagrams.
- **Phosphor Line** (#1c5532): 1px strokes on buttons and chips. Not for text.
- **Phosphor Frame** (#26743f): box-drawing glyphs for frames and rules.
- **Command White** (#e6ffee): typed commands and input text.

### Signal
- **Refusal Red** (#ff5d55): only for refusals and errors inside the terminal.
- **Caution Amber** (#ffb547): only for honest warnings (`warn` lines, known limits).

### Named Rules
**The One Phosphor Rule.** Green is the only colour that decorates. Red and amber appear only where the content is a refusal or a warning.

## Typography

**Display Font:** VT323 (with ui-monospace)
**Body Font:** JetBrains Mono Variable (with ui-monospace)

**Character:** A bitmap CRT face for the voice, a precise coding mono for the facts. Both are self-hosted through @fontsource so the strict CSP holds.

### Hierarchy
- **Display** (400, clamp(3.5rem, 7vw, 6rem), 0.88): the hero line and the closing line, with a 22px phosphor text-shadow.
- **Headline** (400, clamp(2.6rem, 4.4vw, 4rem), 0.92): section headings, balanced.
- **Close** (400, clamp(3rem, 6.5vw, 6rem), 0.92): the closing call, same glow as Display.
- **Wordmark** (400, 34px VT323): `kingslock_` in the nav.
- **Lede** (400, 17px, 1.6): hero paragraph and ADR titles.
- **Body** (400, 16px, 1.6): prose, max 46–52ch.
- **UI** (600, 15px, 1): buttons and the clone command.
- **Small** (400, 14.5px, 1.6): threat table and stack list.
- **Diagram** (fluid, 9–15px across breakpoints, 1.55): the key-derivation diagram, sized so 49 columns fit a phone.
- **Terminal** (400, 13.5px, 1.6): terminal output; tables keep `white-space: pre`.
- **Label** (400, 12–13px): chips, hints, terminal title bar. Sentence case, never tracked caps.

### Named Rules
**The Bitmap Is For Voice Rule.** VT323 never sets anything under 2.6rem. Anything smaller is JetBrains Mono.

## Layout

Two-column grid at desktop (5fr / 7fr, 64px gap): headings and short prose on the left, the working artifact (terminal, diagram, table, list) on the right. Gutters are 56px, 32px at ≤1040px and 16px at ≤720px, where everything stacks into one column. Sections carry 112px above and 104px below. On phones the hero reorders so the terminal sits inside the first screen, directly after the actions.

## Elevation & Depth

Flat. Depth comes from the step between Void Black and Screen Black, and from static scanlines inside the terminal (`repeating-linear-gradient`, 1px in 3px at 16% black). Glow exists only as `text-shadow` on display type and the wordmark.

### Named Rules
**The No Box Shadow Rule.** Nothing casts a shadow. Phosphor glows; it does not float.

## Shapes

Square everything (radius 0). Frames are drawn the way a TUI draws a window: `GlyphFrame` lays out `┌─┐ │ └─┘` in a 3-column grid, with `├─┤` joins between sections and edges made of long glyph runs clipped to their tracks, so the frame follows any size. Section dividers, table rows and list rows are `─` runs clipped to their width. Glyphs are 14px JetBrains Mono at line-height 1 in Phosphor Frame (#26743f). Buttons and chips are the only elements with 1px CSS strokes.

### Named Rules
**The Drawn Frame Rule.** Containers are drawn with box-drawing glyphs, never CSS borders. Only interactive controls carry a 1px stroke.

## Components

### Buttons
- **Shape:** square (0px), 1px Phosphor Green border, 14px 22px padding, 600 weight, 15px.
- **Primary:** Phosphor Green fill, black text. Hover inverts to black fill with green text (140ms, cubic-bezier(0.16, 1, 0.3, 1)).
- **Ghost:** transparent with a Phosphor Line border; the border turns green on hover.
- **Focus:** 2px Phosphor Green outline, 3px offset.

### Command Chips
- **Style:** transparent, 1px Phosphor Line border, green label. Hover fills green with black text.
- **State:** never disabled; clicks queue behind the running command.

### Inputs
- **Style:** borderless on Screen Black, Command White text, green caret, a `$` prompt label.
- **Focus:** a 2px green underline on the prompt row (`inset 0 -2px 0`).

### Navigation
- VT323 wordmark `kingslock_` with a blinking underscore (stops under reduced motion), 14px mono links, quiet muted link for Owner sign-in. Section links hide below 720px.

### Breach Terminal (signature)
A title bar (`attacker@leak: ~`), a scrolling `role="log"` screen, a prompt input and a row of command chips. Lines are toned `cmd`, `out`, `dim`, `ok` (prefixed ✓), `err` and `warn`. The first command types itself once on load; under reduced motion the output appears at once. Output must be real or verbatim from the codebase.

## Do's and Don'ts

### Do:
- **Do** show proof as terminal output generated by the product's own code (`encryptJson`, real error codes).
- **Do** keep Void Black (#000000) as the page ground.
- **Do** theme the browser surfaces: selection is green with black text, the caret is green, the scrollbar is Phosphor Line.
- **Do** keep one orchestrated motion moment (the hero auto-run) and nothing else animated except cursors.

### Don't:
- **Don't** use box shadows, rounded corners, cards or CSS borders on containers.
- **Don't** use red or amber as decoration.
- **Don't** set small text in VT323.
- **Don't** invent metrics, users, audits or crack-speed benchmarks; PRODUCT.md lists what is real.
