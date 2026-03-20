import React, { useState } from "react";

interface DeviceLookupFormProps {
  email?: string;
  onSubmit: (data: { email: string; deviceId: string }) => void;
  submitting: boolean;
}

export const DeviceLookupForm: React.FC<DeviceLookupFormProps> = ({ email = "", onSubmit, submitting }) => {
  const [form, setForm] = useState({
    email,
    deviceId: "",
  });
  const [touched, setTouched] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (form.email && form.deviceId) {
      onSubmit(form);
    }
  };

  const isEmailValid = /.+@.+\..+/.test(form.email);
  const isValid = isEmailValid && form.deviceId;

  return (
    <form className="flex flex-col gap-3 w-full" onSubmit={handleSubmit}>
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
      <input
        name="deviceId"
        type="text"
        placeholder="ID o nombre del dispositivo"
        className="px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        value={form.deviceId}
        onChange={handleChange}
        required
      />
      <button
        type="submit"
        className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        disabled={!isValid || submitting}
      >
        {submitting ? "Buscando..." : "Consultar dispositivo"}
      </button>
      {touched && !isEmailValid && (
        <span className="text-xs text-red-500">Correo inválido</span>
      )}
    </form>
  );
};
