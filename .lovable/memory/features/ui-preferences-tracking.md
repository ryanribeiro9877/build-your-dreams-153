---
name: UI Preferences & Tracking
description: Per-user persistence of sidebar/right-panel collapse, keyboard shortcuts, ARIA, and ui_events tracking
type: feature
---

# Layout preferences & UI tracking

## Persistence
Per-user collapse state for the left sidebar and right operations panel is stored in `public.user_ui_preferences` (`sidebar_collapsed`, `right_collapsed`). RLS limits access to the row's own user. The `useUiPreferences` hook hydrates from server on login (overrides localStorage) and writes back debounced (400 ms).

## Keyboard shortcuts
- **Ctrl/Cmd+B** → toggle left sidebar
- **Ctrl/Cmd+O** → toggle right operations panel
Shortcuts are ignored while typing in inputs/textareas/contenteditable. Both toggle buttons expose `aria-keyshortcuts`, `aria-expanded`, `aria-controls`. Live region `<div role="status" aria-live="polite">` announces state changes.

## Tracking
`ui_events` table (admin-only SELECT) accepts: `sidebar_toggle`, `right_panel_toggle`, `nav_click`, `tooltip_open`, `shortcut_used`. Use `trackUiEvent(name, { surface, target_id, target_label, source, collapsed })` from `src/lib/uiTracking.ts`. Anon + authenticated can insert; payload sizes are constrained by RLS.

## Focus & contrast
Custom `:focus-visible` ring uses `--gold` token with `outline-offset` and a soft glow shadow on toggles, nav items, and agent items.
