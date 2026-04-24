-- Landing page event tracking
CREATE TABLE public.landing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  session_id text,
  page_path text,
  referrer text,
  cta_id text,
  cta_label text,
  section text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Helpful indexes for analytics queries
CREATE INDEX idx_landing_events_created_at ON public.landing_events (created_at DESC);
CREATE INDEX idx_landing_events_event_name ON public.landing_events (event_name);
CREATE INDEX idx_landing_events_cta_id ON public.landing_events (cta_id);
CREATE INDEX idx_landing_events_section ON public.landing_events (section);

-- RLS
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) may insert tracking rows. They are anonymous and contain no PII.
CREATE POLICY "Anyone can record landing events"
  ON public.landing_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read the analytics data.
CREATE POLICY "Only admins can read landing events"
  ON public.landing_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));