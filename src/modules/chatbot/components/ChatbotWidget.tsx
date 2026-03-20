
import React, { useState } from 'react';
import { RobotButton } from './RobotButton';
import { useChatbot } from '../hooks/useChatbot';
import { getDeviceBySerial } from '../../devices/services/device.service';

const PROBLEM_OPTIONS = [
  { key: 'login', label: 'Problema de login' },
  { key: 'slow', label: 'Equipo lento' },
  { key: 'software', label: 'Error software' },
  { key: 'network', label: 'Red' },
  { key: 'other', label: 'Otro problema' },
];

export const ChatbotWidget: React.FC = () => {
  const {
    step, setStep,
    serial, setSerial,
    selectedDevice, setSelectedDevice,
    problem, setProblem,
    ticket, setTicket,
    companies, devices, createTicket
  } = useChatbot();
  const [manualProblem, setManualProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  // Paso 1: Solicitar serial
  if (step === 'start') {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <RobotButton onClick={() => setStep('serial')} />
      </div>
    );
  }

  // Paso 2: Ingresar serial
  if (step === 'serial') {
    return (
      <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
          <span className="font-semibold text-neutral-800 text-base">Soporte Técnico</span>
          <button className="text-neutral-400 hover:text-neutral-700" onClick={() => setStep('start')}>✕</button>
        </div>
        <div className="flex-1 px-4 py-6 flex flex-col items-center gap-3">
          <span className="text-neutral-700 font-medium">Ingresa el serial de tu equipo</span>
          <input
            className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
            value={serial}
            onChange={e => setSerial(e.target.value)}
            placeholder="Serial del equipo"
            autoFocus
          />
          <button
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors w-full"
            disabled={!serial}
            onClick={async () => {
              setLoading(true);
              // Buscar equipo por serial directamente en Supabase
              try {
                const found = await getDeviceBySerial(serial);
                setLoading(false);
                if (found) {
                  setSelectedDevice(found);
                  setStep('device');
                } else {
                  setConfirmation('No se encontró el equipo. Verifica el serial o contacta a soporte.');
                }
              } catch (err: any) {
                setLoading(false);
                setConfirmation('Error al consultar el equipo: ' + (err?.message || 'Error desconocido'));
              }
            }}
          >Buscar equipo</button>
          {confirmation && <span className="text-xs text-red-500">{confirmation}</span>}
        </div>
      </div>
    );
  }

  // Paso 3: Mostrar info del equipo
  if (step === 'device' && selectedDevice) {
    return (
      <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
          <span className="font-semibold text-neutral-800 text-base">Equipo encontrado</span>
          <button className="text-neutral-400 hover:text-neutral-700" onClick={() => setStep('start')}>✕</button>
        </div>
        <div className="flex-1 px-4 py-6 flex flex-col gap-2">
          <span className="text-neutral-700 font-medium">Serial: {selectedDevice.serial_number}</span>
          <span className="text-neutral-500 text-sm">Tipo: {selectedDevice.type}</span>
          <span className="text-neutral-500 text-sm">Estado: {selectedDevice.status}</span>
          <button className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors w-full" onClick={() => setStep('problem')}>Reportar problema</button>
        </div>
      </div>
    );
  }

  // Paso 4: Seleccionar problema
  if (step === 'problem' && selectedDevice) {
    return (
      <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
          <span className="font-semibold text-neutral-800 text-base">Selecciona el problema</span>
          <button className="text-neutral-400 hover:text-neutral-700" onClick={() => setStep('start')}>✕</button>
        </div>
        <div className="flex-1 px-4 py-6 flex flex-col gap-2">
          {PROBLEM_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`w-full px-4 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-left transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-primary ${problem === opt.label ? 'ring-2 ring-primary' : ''}`}
              onClick={() => { setProblem(opt.label); setStep('confirm'); }}
            >{opt.label}</button>
          ))}
          <input
            className="mt-2 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
            placeholder="Otro problema..."
            value={manualProblem}
            onChange={e => setManualProblem(e.target.value)}
            onBlur={() => { if (manualProblem) { setProblem(manualProblem); setStep('confirm'); }}}
          />
        </div>
      </div>
    );
  }

  // Paso 5: Confirmar y crear ticket
  if (step === 'confirm' && selectedDevice && problem) {
    return (
      <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
          <span className="font-semibold text-neutral-800 text-base">Confirmar ticket</span>
          <button className="text-neutral-400 hover:text-neutral-700" onClick={() => setStep('start')}>✕</button>
        </div>
        <div className="flex-1 px-4 py-6 flex flex-col gap-2">
          <span className="text-neutral-700 font-medium">¿Deseas crear el ticket con estos datos?</span>
          <span className="text-neutral-500 text-sm">Equipo: {selectedDevice.serial_number}</span>
          <span className="text-neutral-500 text-sm">Problema: {problem}</span>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors w-full"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                // Obtener datos del usuario autenticado
                const requester = selectedDevice.user_id || 'usuario';
                const requester_email = '';
                const subject = `Soporte: ${selectedDevice.serial_number}`;
                const description = problem;
                const company_id = selectedDevice.company_id;
                const t = await createTicket({
                  requester,
                  requester_email,
                  subject,
                  description,
                  company_id,
                });
                setTicket(t);
                setStep('done');
              } catch (e: any) {
                setConfirmation('Error al crear el ticket: ' + (e.message || e));
              } finally {
                setLoading(false);
              }
            }}
          >Crear ticket</button>
          {confirmation && <span className="text-xs text-red-500">{confirmation}</span>}
        </div>
      </div>
    );
  }

  // Paso 6: Ticket creado
  if (step === 'done' && ticket) {
    return (
      <div className="fixed bottom-24 right-6 z-50 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
          <span className="font-semibold text-neutral-800 text-base">¡Ticket creado!</span>
          <button className="text-neutral-400 hover:text-neutral-700" onClick={() => setStep('start')}>✕</button>
        </div>
        <div className="flex-1 px-4 py-6 flex flex-col gap-2 items-center justify-center">
          <span className="text-green-600 font-medium">Ticket creado correctamente</span>
          <span className="text-neutral-700 text-sm">N° de caso: {ticket.case_number}</span>
          <button className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors w-full" onClick={() => setStep('start')}>Cerrar</button>
        </div>
      </div>
    );
  }

  return null;
};

export default ChatbotWidget;
