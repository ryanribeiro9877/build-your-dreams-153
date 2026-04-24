-- Lightweight UI event tracking for in-app interactions.
CREATE TABLE IF NOT EXISTS public.ui_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NULL,
  session_id text NULL,
  event_name text NOT NULL,
  surface text NULL,
  target_id text NULL,
  target_label text NULL,
  metadata jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ui_events ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can record events with reasonable size limits and a closed event vocabulary.
CREATE POLICY "Anyone can record ui events"
  ON public.ui_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    event_name = ANY (ARRAY[
      'sidebar_toggle',
      'right_panel_toggle',
      'nav_click',
      'tooltip_open',
      'shortcut_used'
    ])
    AND char_length(event_name) <= 64
    AND (session_id IS NULL OR char_length(session_id) <= 128)
    AND (surface IS NULL OR char_length(surface) <= 64)
    AND (target_id IS NULL OR char_length(target_id) <= 128)
    AND (target_label IS NULL OR char_length(target_label) <= 256)
  );

-- Only admins can read aggregates.
CREATE POLICY "Only admins can read ui events"
  ON public.ui_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ui_events_created_at ON public.ui_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_events_user_id ON public.ui_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ui_events_event_name ON public.ui_events (event_name);
