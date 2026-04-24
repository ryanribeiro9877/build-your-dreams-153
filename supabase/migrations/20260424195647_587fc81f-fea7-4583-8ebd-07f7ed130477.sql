-- 1) Extend allowed event_name list on ui_events INSERT policy
DROP POLICY IF EXISTS "Anyone can record ui events" ON public.ui_events;

CREATE POLICY "Anyone can record ui events"
ON public.ui_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name = ANY (ARRAY[
    'sidebar_toggle','right_panel_toggle','nav_click',
    'tooltip_open','shortcut_used','tab_navigate','key_activate'
  ])
  AND char_length(event_name) <= 64
  AND (session_id IS NULL OR char_length(session_id) <= 128)
  AND (surface IS NULL OR char_length(surface) <= 64)
  AND (target_id IS NULL OR char_length(target_id) <= 128)
  AND (target_label IS NULL OR char_length(target_label) <= 256)
);

-- 2) Realtime for user_ui_preferences
ALTER TABLE public.user_ui_preferences REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ui_preferences;