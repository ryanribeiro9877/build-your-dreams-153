-- Replace the permissive insert policy with one that validates inputs.
-- Anyone can still insert (we need anonymous landing tracking), but only with
-- known event names and bounded string lengths.
DROP POLICY IF EXISTS "Anyone can record landing events" ON public.landing_events;

CREATE POLICY "Anyone can record landing events"
  ON public.landing_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    event_name = ANY (ARRAY['page_view','cta_click','cta_conversion','section_view','faq_open'])
    AND char_length(event_name) <= 64
    AND (session_id IS NULL OR char_length(session_id) <= 128)
    AND (page_path IS NULL OR char_length(page_path) <= 512)
    AND (referrer IS NULL OR char_length(referrer) <= 1024)
    AND (cta_id IS NULL OR char_length(cta_id) <= 128)
    AND (cta_label IS NULL OR char_length(cta_label) <= 256)
    AND (section IS NULL OR char_length(section) <= 128)
  );