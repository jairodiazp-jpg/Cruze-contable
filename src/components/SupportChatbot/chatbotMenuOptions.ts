import React from "react";

export interface ChatbotMenuOption {
  key: string;
  label: string;
  description?: string;
}

export const FAQ_OPTIONS: ChatbotMenuOption[] = [
  {
    key: "faq",
    label: "Preguntas frecuentes",
    description: "Respuestas rápidas a dudas comunes",
  },
  {
    key: "ticket",
    label: "Crear ticket de soporte",
    description: "Reporta un problema o solicita ayuda",
  },
  {
    key: "device",
    label: "Consultar estado de dispositivo",
    description: "Busca información de tu equipo registrado",
  },
];
