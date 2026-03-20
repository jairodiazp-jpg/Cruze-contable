import { useState } from 'react';
import { useCompanies } from '../../companies/hooks/useCompanies';
import { useDevices } from '../../devices/hooks/useDevices';
import { useTickets } from '../../tickets/hooks/useTickets';

export function useChatbot() {
  // Estado y lógica para orquestar el flujo del chatbot
  const [step, setStep] = useState<'start' | 'serial' | 'device' | 'problem' | 'confirm' | 'done'>('start');
  const [serial, setSerial] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [problem, setProblem] = useState('');
  const [ticket, setTicket] = useState<any>(null);

  // Hooks de módulos
  const { companies } = useCompanies();
  const { devices } = useDevices(selectedDevice?.company_id);
  const { createTicket } = useTickets(selectedDevice?.company_id);

  return {
    step, setStep,
    serial, setSerial,
    selectedDevice, setSelectedDevice,
    problem, setProblem,
    ticket, setTicket,
    companies, devices, createTicket
  };
}
