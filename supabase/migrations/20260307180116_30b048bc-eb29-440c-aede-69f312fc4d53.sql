
-- Fix permissive INSERT policies by requiring auth.uid() is not null
DROP POLICY "Authenticated can create tickets" ON public.tickets;
CREATE POLICY "Authenticated can create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Authenticated can add comments" ON public.ticket_comments;
CREATE POLICY "Authenticated can add comments" ON public.ticket_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
