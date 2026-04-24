---
name: UI Preferences & Tracking
description: Per-user persistence (with realtime sync) of sidebar/right-panel collapse, keyboard shortcuts, ARIA, ui_events tracking, and admin analytics
type: feature
---

# Layout preferences & UI tracking

## Persistence + realtime sync
Per-user collapse state for the left sidebar and right operations panel is stored in `public.user_ui_preferences` (`sidebar_collapsed`, `right_collapsed`). RLS limits access to the row's own user. The `useUiPreferences` hook hydrates from server on login (overrides localStorage), writes back debounced (400 ms), and **subscribes to `postgres_changes`** on its own row so layout changes from another device propagate within ~1s. Realtime is enabled via `ALTER PUBLICATION supabase_realtime ADD TABLE user_ui_preferences` + `REPLICA IDENTITY FULL`.

## Keyboard shortcuts
- **Ctrl/Cmd+B** → toggle left sidebar
- **Ctrl/Cmd+O** → toggle right operations panel
Shortcuts are ignored while typing in inputs/textareas/contenteditable. Both toggle buttons expose `aria-keyshortcuts`, `aria-expanded`, `aria-controls`. Live region `<div role="status" aria-live="polite">` announces state changes.

## Tooltips
Collapsed sidebar items are wrapped via `withTooltip(label, node, targetId)`. Tooltips:
- Track `tooltip_open` events with `target_id` / `target_label`.
- Close on **Escape** (Radix default) and `onEscapeKeyDown` is `preventDefault`-ed so focus stays on the trigger — Tab order is preserved.

## Tracking
`ui_events` table (admin-only SELECT) accepts: `sidebar_toggle`, `right_panel_toggle`, `nav_click`, `tooltip_open`, `shortcut_used`, `tab_navigate`, `key_activate`. Use `trackUiEvent(name, { surface, target_id, target_label, source, collapsed })` from `src/lib/uiTracking.ts`. Anon + authenticated can insert; payload sizes constrained by RLS. `tab_navigate` fires on `:focus-visible` (keyboard focus only); `key_activate` fires on Enter/Space activation of nav items.

## Admin analytics — `/admin/ui`
Admin-only React page (`src/pages/AdminUiEvents.tsx`) with date-range, event-type and user-id filters. Visualizes:
- Totals by event (bar chart)
- Daily evolution per event (multi-line chart)
- Top 10 target labels (horizontal bar)
- Last 100 raw events (table)

## Focus & contrast
Custom `:focus-visible` ring uses `--gold` token with `outline-offset` and a soft glow shadow on toggles, nav items, and agent items.

## Tests
`src/components/__tests__/JurisCloudOS.responsive.test.tsx` covers: Ctrl+B toggle, Escape on tooltip preserving focus, mobile (375px) overlay rendering, and tracking vocabulary.
