---
name: Landing Events Tracking
description: Anonymous event tracking for landing CTAs, page views, section views, and FAQ opens via landing_events table
type: feature
---

# Landing Events Tracking

## Overview
A lightweight, anonymous event tracker measures landing-page engagement and conversions.

## Helper
`src/lib/tracking.ts` exports:
- `trackEvent(name, payload)` — fire-and-forget insert into `landing_events`.
- `onCtaClick(ctaId, ctaLabel, section, destination?)` — convenience wrapper for CTAs.

Allowed event names: `page_view`, `cta_click`, `cta_conversion`, `section_view`, `faq_open`.

A per-tab `session_id` is generated in `sessionStorage` (key `lf_session_id`). No PII is stored.

## CTAs instrumented (LandingPage.tsx)
- `nav_primary` / `mobile_nav_primary` — navbar
- `hero_primary` / `hero_secondary` — hero buttons
- `plan_starter` / `plan_professional` / `plan_enterprise` — pricing
- `cta_final` — bottom box (also fires `cta_conversion`)
- `faq_contact` — FAQ footer
- `faq_<i>` — `faq_open` events when each question expands

## Section view tracking
On mount, `IntersectionObserver` (threshold 0.4) emits `section_view` once per session for each `<section id="…">`.

## Database
Table `public.landing_events` (id, event_name, session_id, page_path, referrer, cta_id, cta_label, section, metadata jsonb, created_at). Indexed on created_at, event_name, cta_id, section.

## RLS
- INSERT: `anon` + `authenticated` allowed, but constrained — `event_name` must be in the allowed list and string fields are length-bounded to mitigate abuse.
- SELECT: only `admin` role (`has_role(auth.uid(), 'admin')`).

## Reading data
Admins query the table directly via `supabase.from('landing_events')`. Suggested aggregations: clicks per `cta_id`, conversion funnel from `section_view` → `cta_click` → `cta_conversion`, breakdown by `referrer`.
