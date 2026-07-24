# Crest88 Operator Design System

The Operator system is the durable visual authority for Crest88’s public website.

## Visual thesis

Crest88 should feel like an exact operating instrument in daylight: calm enough for an owner to
trust, clear enough to understand immediately, and alive only where motion explains work moving.
The visual system avoids consulting-page ornament, generic AI glow, clip-art scenes, and decorative
dashboard clutter.

## Palette

- Page: cool near-white with a restrained indigo atmosphere.
- Surface: true white for evidence and reading.
- Ink: near-black navy.
- Secondary ink: cool slate, kept at accessible contrast.
- Product accent: decisive indigo for actions, the orb, rules, and data emphasis.
- State colors: green for completed/approved, amber for waiting, red for denied.
- Dark product demonstration: deep navy with tinted state surfaces.

Large areas stay quiet. Color communicates action, state, or product identity; it is not sprinkled
across every component.

## Typography

- Display and high-level labels: Space Grotesk.
- Body, navigation, and controls: Plus Jakarta Sans.
- Compact data, state, and measurement labels: JetBrains Mono.
- Headlines are compact, balanced, and never exceed 6rem.
- Body copy stays within a readable 65–75 character measure.

## Geometry and depth

- Public content uses a centered 1180px maximum rail.
- Major surfaces use 18–26px radii; buttons and small status chips may be pill-shaped.
- Depth comes from one soft indigo-aware shadow with a visible vertical offset.
- Borders or shadow establish elevation, not both as redundant decoration.
- Spacing follows an 8px base with generous separation between story beats.

## Signature elements

- The circular dotted thinking orb is the global mark. It animates as an undulating, spherical
  ribbon and resolves to a still frame under reduced motion.
- The hero pairs one short product promise with a real-feeling agent desk. The desk shows exactly
  one activity at a time and keeps a fixed shape through state changes.
- Approval and Deny are direct, familiar controls. Sensitive work is amber while waiting, then
  resolves green or red.
- Customer outcomes use strong numeric hierarchy and deliberate previous/next controls. They never
  use a progress bar.

## Motion

Motion is authored around the product mechanism: the orb composes, the live desk transitions between
routine and review states, and customer evidence moves as one coherent carousel. Content is visible
by default. Transitions use a smooth ease-out, pause during interaction, and collapse to static
states for reduced motion. Repeated scroll-reveal choreography is kept sparse.

## Responsive behavior

Desktop uses a two-part hero and three visible customer outcomes. Tablet and mobile move to one
reading column; customer outcomes show one at a time; action buttons reach comfortable touch sizes.
Mobile is composed intentionally, never treated as a compressed desktop.

## Copy and interaction

The offer, the human control boundary, and the primary action are findable within seconds. Buttons
name the action they perform. Errors explain both the problem and recovery. The contact form is a
single shared destination rather than multiple competing conversion patterns.
