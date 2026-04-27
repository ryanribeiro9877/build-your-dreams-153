CREATE POLICY "Users can delete their own notifications"
ON public.bottleneck_notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);