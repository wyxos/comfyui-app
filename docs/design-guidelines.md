# Comfy Companion UI Guidelines

Reference direction for the companion app UI.

## Framework and component style

- Use `shadcn-vue` conventions for future components.
- Prefer compact, operational layouts over oversized marketing-style spacing.
- Default roundness is `small` to `medium`.
- Radius system should center on `rounded-sm` and `rounded-md`
- Main control radius target: `rounded-md`
- Tighter chips or compact status elements: `rounded-sm`
- Do not treat larger radii as part of the design baseline

## Core palette

- Primary: `#001B2E`
- Canvas: `#F0F7F4`
- Accent: `#0090C1`
- Secondary: `#F0C808`
- Destructive: `#DD1C1A`

## Color usage

- `#001B2E` is the anchor color.
  - Use for primary actions, high-contrast surfaces, headers, important text.
- `#F0C808` is the secondary emphasis color.
  - Use for spotlight moments, counters, warnings, or selective emphasis.
  - Do not use it as the main page background.
- `#0090C1` is the interaction color.
  - Use for links, focus rings, active states, and progress.
- `#DD1C1A` is destructive only.
  - Use for failure, destructive actions, and critical alerts.
- `#F0F7F4` remains the default canvas/surface family.

## Interaction rules

- Blue carries interaction.
- Yellow carries attention.
- Red carries failure.
- Avoid using multiple loud colors on the same control cluster.

## Component direction

- Buttons:
  - Primary = navy fill
  - Secondary = yellow fill
  - Outline = light surface with navy text
- Inputs:
  - Neutral fills
  - Blue focus ring
  - Explicit labels
- Cards and sheets:
  - Off-white surfaces
  - Clear borders
  - Light shadow, not heavy glow

## Tone

- Precise
- Clean
- Tool-like
- Slightly stern rather than playful
