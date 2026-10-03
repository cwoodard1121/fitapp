---
name: simplegym
description: A one-athlete games identity for a personal strength-training log, after Otl Aicher's Munich 1972 program.
colors:
  bg: "#EEF1F2"
  surface: "#FFFFFF"
  surface-2: "#E2E8EB"
  border: "#D0D8DC"
  text: "#0D2433"
  muted: "#536877"
  signal: "#1769B8"
  signal-ink: "#FFFFFF"
  gate-green: "#1B7F45"
  gate-yellow: "#B35A00"
  gate-red: "#C6381E"
  chart-2: "#E07B12"
  chart-3: "#6F8592"
  hue-today: "#5DB0E8"
  hue-checkin: "#4DB86A"
  hue-home: "#F59A3B"
  hue-body: "#A9D15A"
  hue-more: "#C4CBCF"
  on-hue: "#0D2433"
  scrim: "rgb(13 36 51 / 0.45)"
  bg-dark: "#091821"
  surface-dark: "#10242F"
  surface-2-dark: "#16303F"
  border-dark: "#243F4E"
  text-dark: "#E6EEF2"
  muted-dark: "#93AAB8"
  signal-dark: "#A8D6FF"
  signal-ink-dark: "#04121B"
  gate-green-dark: "#4CC97C"
  gate-yellow-dark: "#F2A341"
  gate-red-dark: "#FF6F52"
  chart-2-dark: "#F2A341"
  chart-3-dark: "#6F8A99"
  hue-today-dark: "#3888C4"
  hue-checkin-dark: "#3FA85E"
  hue-home-dark: "#E8892C"
  hue-body-dark: "#98C14B"
  hue-more-dark: "#8C9AA2"
  on-hue-dark: "#071822"
  scrim-dark: "rgb(0 8 14 / 0.6)"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 112"
  signage:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  button:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
  readout:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 88"
  readout-micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 88"
rounded:
  stripe: "3px"
  sm: "0.375rem"
  md: "0.625rem"
  lg: "0.875rem"
  xl: "1.125rem"
  full: "9999px"
spacing:
  rail-gap: "4px"
  cell-gap: "8px"
  gutter: "16px"
  panel: "20px"
  sheet: "24px"
  header: "56px"
  nav: "68px"
  nav-room: "80px"
  sidebar: "240px"
  column: "768px"
  column-wide: "1024px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-touch:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    padding: "0 24px"
    height: "56px"
    width: "100%"
  button-ink:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.gate-red}"
    textColor: "#FFFFFF"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "48px"
  set-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.readout}"
    rounded: "{rounded.md}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  slot-code-tag:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
  venue-band:
    backgroundColor: "{colors.hue-today}"
    textColor: "{colors.on-hue}"
    typography: "{typography.signage}"
    padding: "0 16px"
    height: "56px"
  tab-bar-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "68px"
  tab-bar-cell-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    height: "68px"
  day-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "56px"
  day-chip-active:
    backgroundColor: "{colors.hue-today}"
    textColor: "{colors.on-hue}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "56px"
  week-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    size: "44px"
  week-cell-active:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    size: "44px"
  rail-segment:
    backgroundColor: "{colors.hue-today}"
    rounded: "{rounded.stripe}"
    height: "14px"
  set-mark-done:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.full}"
    size: "32px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: simplegym

## Overview

**Creative North Star: "The One-Athlete Games"**

simplegym is dressed as a games identity for an audience of one, in the manner of Otl Aicher's 1972 Munich program. Every primary destination is a venue with its own colour field, and you find your way by hue and pictogram before you read a word. The band across the top of the screen names the venue in lowercase signage, and the tab bar repeats that hue as a marker on the active tab. The system turns down the usual look of this category: near-black panels, one neon accent, and stacks of stat cards.

The materials are cool paper, white panels that lie flat on 1px hairlines, and deep navy ink. Archivo is the only typeface and does every job through its width axis: wide for signage, regular for reading, semi-condensed with tabular figures for every measurement, so loads, reps and RIR line up like a results board. Density is set for the gym floor: one column, controls sized for a thumb, and the prescription numbers at the front of every screen.

Dark mode is a night version of the same venues rather than a separate theme. It follows `prefers-color-scheme` and is built on navy, never black. The hues deepen, and the action colour becomes pale ice so it stays clearly apart from the today field. Motion is small and tied to function: presses compress, the band and tab marker glide between venues, and rail segments sweep full as a set is logged. Under reduced motion all of it collapses to instant changes.

**Key Characteristics:**
- Five venue hues for wayfinding: today light blue, check-in green, home orange, body lime, more silver.
- Lowercase signage; full sentences keep sentence case.
- One family, three widths: Archivo wdth 112 for signage, default for reading, wdth 88 with tabular figures for numbers.
- White panels lie flat on hairlines. Shadows appear only on things that float: popovers, sheets, the docked rail.
- Ink is deep navy, never black, in both schemes.
- Venue pictograms are filled marks on a 45/90-degree grid. Utility icons are lucide outlines.
- A fixed app frame: only the content region scrolls, and every bar is pinned to the frame.

## Colors

The palette is a set of saturated venue fields on cool paper, set in deep navy ink, with one separate blue reserved for action and focus.

### Primary
- **Munich Light Blue** (#5DB0E8): The today venue. It fills the venue band and the selected day chip, and it drives the session rail segments. It is the default band colour when a route has no venue, and the light-mode status-bar colour.
- **Meadow Green** (#4DB86A): The check-in venue field.
- **Games Orange** (#F59A3B): The home (overview) venue field.
- **Park Lime** (#A9D15A): The body venue field.
- **Aluminium Silver** (#C4CBCF): The "more" venue, shared by program, history, progress, blocks, goals, nutrition and settings.
- **Field Ink** (#0D2433): Text and pictograms set on any venue field (`on-hue`). It has the same value as body ink, so every field reads navy-on-colour. Contrast on the light fields runs 6.4:1 to 9.7:1.

### Secondary
- **Signal Blue** (#1769B8): The single action and focus colour. It fills primary buttons, completed set marks, slider ranges and checked switches. It also colours focus rings, the caret, text selection, links and the route-progress bar. It is deliberately darker and more saturated than Munich Light Blue so that an action never looks like a venue.
- **Signal Ink** (#FFFFFF): Labels on Signal Blue.

### Tertiary
- **Progress Green** (#1B7F45): Gate green. Use it for "add" decisions, the "done" state, saved confirmations, and the rail once a session is finished.
- **Hold Amber** (#B35A00): Gate yellow. Use it for deload and calibrate decisions and the deload-week badge.
- **Back-off Red** (#C6381E): Gate red. Use it for hold/reduce and skip decisions, destructive buttons, remove-set hover and sign out.
- **Second Series Orange** (#E07B12): The second chart series after Signal Blue (`lib/theme.ts`).
- **Third Series Slate** (#6F8592): The third chart series.

### Neutral
- **Cool Paper** (#EEF1F2): The page ground under every scroll region.
- **Panel White** (#FFFFFF): Cards, slot panels, sheets, dialogs, the tab bar, the sidebar and inactive chips.
- **Recess** (#E2E8EB): Secondary button fill, the tab-list track, the badge base, the slot footer band (at 60%) and hover fills.
- **Hairline** (#D0D8DC): Every border and divider, 1px. It is also the slider track and unchecked switch.
- **Deep Navy Ink** (#0D2433): All body text, the ink button, the active week cell and slot-code tags.
- **Slate** (#536877): Secondary text, units, inactive tab labels and placeholders. It holds 5.1:1 on paper.
- **Navy Scrim** (rgb(13 36 51 / 0.45)): The overlay behind sheets and dialogs.

### Dark Variant
- **Night Ground** (#091821): The paper ground in the dark scheme.
- **Night Panel** (#10242F): The dark panel surface; the recess goes to #16303F and the hairline to #243F4E.
- **Frost Ink** (#E6EEF2): Body text in dark mode. Muted text becomes #93AAB8.
- **Pale Ice** (#A8D6FF): The dark-mode signal, set with near-black navy ink (#04121B).
- **Night Today Blue** (#3888C4): The dark today field. The other venues deepen the same way: check-in #3FA85E, home #E8892C, body #98C14B, more #8C9AA2. Field ink becomes #071822.

### Named Rules
**The Venue Rule.** Each primary destination owns one field hue and only one. A hue means "you are here" (band, active tab marker, active sidebar row, selected day). It is never a status, a button fill or decoration. To find a route's hue, use the venue→hue map in `components/app/nav-items.ts`; never pick a hue by eye.

**The Signal Is Not a Venue Rule.** Signal Blue belongs to action and focus, and venue hues belong to place. In dark mode the signal moves to Pale Ice (#A8D6FF) specifically so it never reads as the today field (#3888C4). Keep that separation (2.5:1 between them) whenever either one changes.

**The Navy Ink Rule.** Ink is deep navy (#0D2433), never black. Text, on-hue labels, the scrim and every shadow are tinted from the `--text-rgb` channels.

## Typography

**Display Font:** Archivo (with system-ui, sans-serif)
**Body Font:** Archivo (with system-ui, sans-serif)
**Mono Font:** Archivo (with system-ui, sans-serif)

**Character:** One variable family loaded with its width axis does every job. At wdth 112 Archivo reads as broad, square-shouldered stadium signage. At default width it is a plain reading sans. At wdth 88 with tabular figures it becomes a compact results board for numbers. In this codebase `font-mono` and `.nums` mean semi-condensed Archivo with `tnum`, not a monospace face.

### Hierarchy
- **Display** (800, 2.125rem, 1.05, -0.03em, wdth 112, lowercase): The Today day title ("chest / back"). Use it once per screen, on the destination that is the product's front door.
- **Headline** (800, 1.75rem, 1.1, -0.025em, wdth 112): Page titles on check-in, history detail, nutrition, settings, goals and the program editor.
- **Signage** (800, 1.375rem, 1, -0.02em, wdth 112, lowercase): The venue name in the band. The wordmark (1.25rem) and the "more" sheet title (1.5rem) use the same treatment.
- **Title** (700, 1.125rem, 1.375, -0.01em): Exercise names in slot panels. Card titles use the same weight at 1rem; sheet titles at 1.25rem.
- **Body** (400, 0.875rem, 1.25rem): Card descriptions, helper copy, empty states, sheet and dialog descriptions. Form fields set at 1rem on phones.
- **Button** (600, 0.9375rem, -0.005em, lowercase): Button and nav-row labels ("finish session", "add set").
- **Label** (600, 0.75rem, 1rem, lowercase): Set-grid column heads, tab bar labels, day-chip day numbers, badge text and stat captions (captions at 500).
- **Readout** (700, 1.125rem, 1, -0.01em, wdth 88, tnum): Set-entry values, targets and stats. Stats scale from 1.125rem up to 3rem; day/week meta lines use the same face at 0.875rem/600.
- **Readout Micro** (700, 0.6875rem, 1, wdth 88, tnum): Slot codes under rail segments.

### Named Rules
**The Three Widths Rule.** Width carries the hierarchy, not extra families. Use signage width (112) for names of places and titles, default width for anything you read, and semi-condensed width (88) with tabular figures for anything you measure. Never add a second typeface.

**The Lowercase Signage Rule.** Venue names, nav labels, button labels, chips, field labels, stat captions and day names are lowercase ("check-in", "finish session", "day 1 · chest / back"). Full sentences keep sentence case and their period: helper copy, empty states, toasts and errors ("Log a set to preview next session's call.").

## Layout

The app is a fixed frame. The shell is pinned to `inset: 0` with overscroll disabled, and only `<main>` scrolls, so an installed PWA never rubber-bands its chrome. `main` also hosts pull-to-refresh: a 72px pull threshold, capped at 110px, with a half-speed resistance curve.

Content sits in one column: centered, at most 768px wide (`max-w-3xl`), with a 16px side gutter. Pages pad 16px at the top on phones and 24px from 640px up, with 40px at the bottom. The venue band's inner row uses the same column and gutter, so the venue name and the page content share a left edge. The program editor is the one wide surface, at 1024px (`max-w-5xl`).

Chrome sizes come from tokens that include the safe area:
- The band is 56px plus the top inset.
- The mobile tab bar is 68px plus the bottom inset.
- Content clears the tab bar with 80px plus the inset.
- Today reserves the 68px tab bar plus the inset plus another 92px for its fixed session bar (`pb-session-room`).

From 768px up, a 240px sidebar (Panel White, hairline right edge) replaces the tab bar. The band and the session bar start after the sidebar, and `main` reserves a stable scrollbar gutter. From 640px up, dialogs stop being bottom sheets and center on screen.

Spacing runs on a 4px base:
- 4px between rail segments.
- 8px between set-grid cells and chips.
- 16px between stacked slot panels and as the inner padding of compact panels.
- 20px inside cards.
- 24px inside sheets and dialogs.

Today's day strip scrolls horizontally with snap points on phones and wraps from 768px up. The week strip is a single row of 44px cells.

**The One Column Rule.** Every page builds into the same 768px column with a 16px gutter, aligned under the venue band. Don't center narrower islands or invent new widths. The program editor's 1024px is the only exception.

**The Pinned Bar Rule.** Bars are pinned to the frame (band at the top, tab bar and session bar at the bottom) and never float mid-screen. The one sticky element is the docked session rail, anchored to the top of the scroll region.

**The Thumb Rule.** Anything tappable is at least 44px tall. Default controls are 48px (buttons, inputs, set fields, tab lists). Primary thumb actions and day chips are 56px, and tab bar cells are 68px.

## Elevation & Depth

The system is flat. Panels rest on the paper ground and get their edge from a 1px hairline, not a shadow. Depth comes from tone instead: recessed fills (Recess) for tracks, secondary buttons and footer bands, and Panel White for anything you read or touch. Shadows are kept for surfaces that physically float above the page plane, and every shadow is tinted with navy ink at low alpha, never grey or black.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 8px 24px rgb(var(--text-rgb) / 0.14)`): Dropdown menus, select lists and tooltips.
- **Sheet** (`box-shadow: 0 -8px 32px rgb(var(--text-rgb) / 0.12)`): Bottom sheets and dialogs shown as sheets. The shadow casts upward from the bottom edge.
- **Docked Rail** (`box-shadow: 0 6px 18px rgb(var(--text-rgb) / 0.08)`): The session rail's docked copy, only while it is docked under the band.
- **Pull Indicator** (`box-shadow: 0 4px 12px rgb(var(--text-rgb) / 0.12)`): The round pull-to-refresh puck.
- **Segment Lift** (`box-shadow: 0 1px 2px rgb(var(--text-rgb) / 0.12)`): The active trigger inside a recessed tab list. It is the only ink-tinted shadow that appears at rest.
- **Focus Ring** (`box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--signal)`): The global `:focus-visible` treatment, a paper gap and then a signal ring.

### Named Rules
**The Flat Panel Rule.** Cards, slot panels, chips and bars carry no shadow at rest. If a surface needs separation, give it a hairline or a tone step. A shadow means the surface is floating above the page.

**The Ink-Tinted Shadow Rule.** Shadows are built from `rgb(var(--text-rgb) / a)` so they stay navy in light mode and track the ink in dark mode. Don't use Tailwind's default black shadow presets.

## Shapes

Corners are moderate and get larger with the size of the surface:
- 6px (`sm`) for tags and badges.
- 10px (`md`) for buttons, inputs, set fields, chips, week cells and menus.
- 14px (`lg`) for cards, slot panels, touch buttons and tiles in the more sheet.
- 18px (`xl`) for the top corners of bottom sheets.

Hue stripes have their own small radius of 3px: rail segments and the four-venue stripe on the sign-in screen. The sidebar's venue chip is an 8px square with 2px corners. Full circles are used only for things that are round by nature: set marks, slider and switch thumbs, the sheet grabber, the close button, the account button and the pull indicator.

Every edge is a 1px hairline, and empty states use a dashed hairline. The tab bar's active marker is a 3px bar with only its bottom corners rounded, hanging from the top edge of the tab.

Pictograms follow Aicher's geometry on a 24-unit grid:
- Solid bars of even thickness.
- Square-cut (butt) ends and mitred joints.
- Limbs only at 45 or 90 degrees.
- A round head floating clear of the shoulders.
- Everything filled, never outlined.

**The Square-Cut Rule.** Venue pictograms are drawn from straight bars with butt caps, mitred joins and 45/90-degree angles, plus round heads. Don't add curves, outlines or rounded stroke ends to a venue mark.

## Components

### Buttons
Buttons should feel firm and quiet: a solid block of colour that compresses under the thumb.
- **Shape:** Moderately rounded (0.625rem). Large and touch sizes step up to 0.875rem.
- **Primary:** Signal Blue fill with Signal Ink label, semibold 0.9375rem, 48px tall with 20px side padding. Icons are 18px with an 8px gap.
- **Hover / Focus:** Hover drops the fill to 90% and press to 80%. Press also scales to 0.97 over 150ms. Focus shows a 2px Signal ring with a 2px offset. Disabled buttons switch to a Recess fill with Slate text and stop taking pointer events.
- **Secondary / Ghost / Tertiary:**
  - Secondary is a Recess fill ("add set", "use 7").
  - Outline is Panel White with a hairline.
  - Ghost is transparent and gets Recess on hover ("reopen").
  - Ink is a navy fill with a paper label.
  - Destructive is Back-off Red with a white label.
  - Link is Signal text with a 4px underline offset.
- **Sizes:** default 48px, large 56px, touch 56px full-width, icon 48px square. The compact `sm` size (40px) is below the Thumb Rule's 44px floor, as are the 40px round close and account buttons. Don't use them for anything tapped mid-set.

### Chips (Badges)
- **Style:** A small 6px-radius tag, 4px by 8px padding, label type at 600. The default badge is a Signal fill, and the secondary and muted badges use Recess. Status badges are a 10% tint of their gate colour (15% for amber) with full-strength text: green, amber, red, and a signal tint.
- **Decision badge:** The engine's next-session call, shown as a tag with a lucide icon and an optional one-line reason in Slate under it. Adds are Progress Green, hold/skip is Back-off Red, deload/calibrate is Hold Amber, and maintain stays muted.
- **Slot code tag:** A navy tag with a paper label in readout type ("D1A1"). It sits on the baseline before each exercise name.

### Cards / Containers
- **Corner Style:** 0.875rem.
- **Background:** Panel White on Cool Paper.
- **Shadow Strategy:** None (see the Flat Panel Rule).
- **Border:** 1px Hairline.
- **Internal Padding:** 20px for cards and 16px for slot panels and the readiness row. A slot panel ends in a footer band: Recess at 60% under a hairline top edge, holding the next-session call and readouts.
- **Focus:** When an input inside a slot panel has focus, the panel border shifts to signal at 50% and a 4px signal halo at 10% appears around it, so the active exercise is obvious mid-set.

### Inputs / Fields
- **Style:** Panel White with a 1px hairline, 0.625rem radius, 48px tall, 14px side padding. Text is 1rem on phones (so iOS never zooms on focus) and 0.875rem from 640px up. Placeholders are Slate at 80%. Number spinners are removed; the keypad does that job.
- **Focus:** The border turns Signal and a 2px Signal ring at 30% appears. Set-entry fields also tint to signal at 5%.
- **Set fields:** Centered readout type (Archivo wdth 88, tabular, bold 1.125rem) in a five-column grid: a set mark, load, reps, RIR, and a 44px remove button. Focusing a field selects its whole value.
- **Error / Disabled:** Disabled fields drop to 50% opacity. Save failures go to a toast, not inline field states.

### Navigation
- **Venue band:** A full-bleed field in the current venue's hue that runs under the status bar. It holds the venue pictogram (about 26px) and the lowercase venue name in signage type, plus a 40px round account button tinted 10% with field ink. On every route change it retints the browser `theme-color` so Android's status bar matches the field.
- **Mobile tab bar:** Five equal 68px cells on Panel White under a hairline top edge: today, check-in, home, body, more. Each cell is a 26px filled pictogram over a 12px semibold lowercase label. Inactive cells are Slate. The active cell turns navy and carries a 3px hue marker on its top edge. The marker and band share view-transition names, so both glide to their next state when you change venue. Pressing a cell scales it to 0.94.
- **More sheet:** A bottom sheet titled "more" in signage type, holding a three-column grid of 96px tiles. Tiles use lucide icons at stroke 2.25. The active tile is filled with Aluminium Silver.
- **Desktop sidebar:** A 240px Panel White column with the wordmark at band height. Rows are 44px, with 20px icons and 15px semibold labels. The active row becomes its venue's field with field ink. Inactive primary venues carry an 8px hue chip on the right. A hairline divider separates the four venues from the rest.

### Venue Band
This is the signature of the system and the first thing on every screen. Its height is 56px plus the top safe area. The inner row is aligned to the 768px content column, and colour changes between venues ease over 200ms. Routes outside the primary venues show "simplegym" on the today field.

### Session Rail
The live shape of the session: one segment per exercise slot, in a single row with 4px gaps.
- Each segment is a 14px stripe with a 3px radius, using the today hue at 25% as its track. The segment sweeps full from left to right (300ms ease-out) the moment a set gets reps.
- Under each stripe is its slot code in readout micro type.
- The slot crossing the upper third of the screen is marked with a 2px navy ring, and tapping a segment scrolls to that slot.
- When the session is finished, the whole rail turns Progress Green.
- Once the inline rail scrolls out of view, a docked copy slides down under the band: Panel White at 95% (85% with backdrop blur), a hairline bottom edge, and the Docked Rail shadow. While undocked, the copy is fully hidden, not just moved.

### Day and Week Selectors
- **Week cells:** 44px squares in readout type ("w1"). The active week inverts to a navy fill with a paper label. The calendar-current week carries a 4px signal dot.
- **Day chips:** 56px-tall chips at least 88px wide, with "day N" as a small label over the lowercase day name. The selected day takes the today field. A completed day shows a green check and an in-progress day a signal dot.

### Session Bar
A bar pinned above the tab bar on Today: Panel White at 95% with backdrop blur and a hairline top edge, with its content held in the 768px column. On the left is the lowercase "day N · name" with a readout line ("2 of 6 logged · w1"). On the right is the primary "finish session" button. A finished session swaps the button for a green "done" mark and a ghost "reopen" button.

### Sheets and Dialogs
Bottom sheets carry most interaction. Each has:
- Panel White and an 18px top radius.
- A hairline top edge and the Sheet shadow over the Navy Scrim.
- A 40px by 6px grabber and a 40px round close button in Recess.
- A maximum height of 92% of the small viewport.
- Bottom padding that clears the home indicator.

You can drag a sheet down to dismiss it. It follows the finger and closes when flung (faster than 0.5px/ms after 24px) or pulled past 140px or 35% of its height. Otherwise it settles back over 240ms. Inputs, sliders and scrolled lists inside the sheet never start a drag. Sheets open over 300ms and close over 200ms.

Below 640px, a dialog is the same bottom sheet, grabber and drag-dismiss included. From 640px up it becomes a centered 512px panel with a 0.875rem radius and a full hairline.

### Pictograms
There are five filled venue marks, drawn as described under Shapes: a lifter with the bar locked out overhead (today), a clipboard cut by a 45-degree tick (check-in), a house under a 45-degree roof (home), a standing figure with arms at 45 degrees (body), and four solid cells (more). They render in `currentColor` and appear only for venues. Every utility icon is a lucide outline at 18px inside buttons, so the two kinds of icon never get confused.

### Set Marks and Readouts
Each set row starts with a 32px circle. Before a set is logged, it is a 2px hairline ring with a Slate number. Once the set has reps, it fills with Signal Blue using the set-mark pop: scale 0.4 to 1 over 180ms on `cubic-bezier(0.2, 0, 0, 1)`. Stats are readout figures with a lowercase Slate caption above and a quiet unit at 60% size. Only the hero readouts (session e1RM, the recap total) tween their digits.

## Do's and Don'ts

### Do:
- **Do** map each destination to its venue hue through `VENUE_BG` / `routeVenue` in `components/app/nav-items.ts`: today #5DB0E8, check-in #4DB86A, home #F59A3B, body #A9D15A, more #C4CBCF.
- **Do** set navy field ink (`text-on-hue`) on every venue fill, and navy ink (#0D2433) for text everywhere else.
- **Do** keep Signal Blue (#1769B8 light, #A8D6FF dark) for actions, focus, selection and completed sets, and keep it visibly apart from the today hue.
- **Do** set signage (venue names, page titles, the wordmark) in Archivo at `font-wide` (wdth 112), weight 800, with tight negative tracking.
- **Do** set every measurement (load, reps, RIR, weeks, codes, stats) in `font-mono` / `.nums`, which is Archivo at wdth 88 with tabular figures.
- **Do** write labels, buttons, chips and venue names in lowercase, and full sentences in sentence case with a period.
- **Do** build panels as Panel White on Cool Paper with a 1px hairline and a 0.875rem radius, and no shadow.
- **Do** build into the 768px column with a 16px gutter, aligned under the band. Go to 1024px only for the program editor.
- **Do** make tappable controls 44px or taller: 48px by default, 56px for primary thumb actions.
- **Do** use bottom sheets with drag-to-dismiss for secondary tasks on phones. Let `Dialog` become a sheet below 640px.
- **Do** pair every transition and animation with a `motion-reduce` fallback. The global reduced-motion rule already zeroes durations; JS-driven motion checks `prefers-reduced-motion` itself, as the rail and drag-dismiss do.
- **Do** theme the browser surfaces from tokens: the caret and selection come from signal, the focus ring is a paper gap plus a signal ring, and the scrollbar uses the hairline.

### Don't:
- **Don't** use near-black panels with a single neon accent or stacks of stat cards. That is the category default this identity was built to refuse.
- **Don't** use pure black (#000) for ink, scrims or shadows. Tint from `--text-rgb`.
- **Don't** use a venue hue as a button fill, a status colour or decoration, and don't use Signal Blue as a venue field.
- **Don't** put a shadow on a resting card, chip or bar, and don't reach for Tailwind's `shadow-md`/`shadow-lg`/`shadow-xl` presets.
- **Don't** set signage, labels or eyebrows in uppercase with wide letter-spacing, and never put an eyebrow line above a heading.
- **Don't** draw a venue pictogram as an outline icon, or use a filled pictogram for a utility action.
- **Don't** add a second typeface or a real monospace font. Width and tabular figures do that job.
- **Don't** let a bar float mid-screen or make the page chrome scroll. Only `<main>` scrolls.
- **Don't** add gradient washes or decorative glows to panels or dialogs. The only halo is the focus state.
- **Don't** introduce a new content width, or let content drift off the band's left edge.
