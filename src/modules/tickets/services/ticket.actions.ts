import { supabase } from '@/integrations/supabase/client';
import type { Ticket, TicketStatus } from '../types/ticket.types';

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', ticketId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Ticket;
}
