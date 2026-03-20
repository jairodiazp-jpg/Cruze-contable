import React, { useState } from "react";

interface TicketFormProps {
  name?: string;
  email?: string;
  onSubmit: (data: { name: string; email: string; message: string }) => void;
  submitting: boolean;
}

export const TicketForm: React.FC<TicketFormProps> = ({ name = "", email = "", onSubmit, submitting }) => {
  const [form, setForm] = useState({
    name,
    email,
    message: "",
  });
  const [touched, setTouched] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (form.name && form.email && form.message) {
      onSubmit(form);
    }
  };

  const isEmailValid = /.+@.+\..+/.test(form.email);
  const isValid = form.name && isEmailValid && form.message;

  return (
    <form className="flex flex-col gap-3 w-full" onSubmit={handleSubmit}>
      <input
        name="name"
        type="text"
        placeholder="Nombre"
        autoComplete="name"
        className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        value={form.name}
        onChange={handleChange}
        required
      />
      <input
        name="email"
        type="email"
        placeholder="Correo electrónico"
        autoComplete="email"
        className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        value={form.email}
        onChange={handleChange}
        required
      />
      <textarea
        name="message"
        placeholder="Describe tu problema o solicitud"
        className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
        value={form.message}
        onChange={handleChange}
        required
      />
      <button
        type="submit"
        className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        disabled={!isValid || submitting}
      >
        {submitting ? "Enviando..." : "Enviar ticket"}
      </button>
      {touched && !isEmailValid && (
        <span className="text-xs text-red-500">Correo inválido</span>
      )}
    </form>
  );
};
