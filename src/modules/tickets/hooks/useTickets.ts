import { useState, useEffect } from 'react';
import { listTicketsByCompany, createTicket } from '../services/ticket.service';
import type { Ticket } from '../types/ticket.types';

export function useTickets(company_id?: string) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company_id) return;
    listTicketsByCompany(company_id)
      .then(setTickets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [company_id]);

  return { tickets, loading, error, createTicket };
}
