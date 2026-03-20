import React from "react";

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_LIST: FaqItem[] = [
  {
    question: "¿Cómo recupero mi contraseña?",
    answer: "Haz clic en 'Olvidé mi contraseña' en la pantalla de inicio de sesión y sigue las instrucciones para restablecerla.",
  },
  {
    question: "¿Cómo registro un nuevo dispositivo?",
    answer: "Solicita a tu administrador el alta de un nuevo dispositivo o utiliza el portal de empleados si tienes permisos.",
  },
  {
    question: "¿Dónde consulto mis tickets abiertos?",
    answer: "Puedes ver el estado de tus tickets en la sección 'Tickets' del portal o consultando con tu correo en este chat.",
  },
  {
    question: "¿Qué hago si no tengo acceso a internet?",
    answer: "Contacta a soporte desde otro dispositivo o llama a la línea directa de tu empresa para asistencia urgente.",
  },
];
