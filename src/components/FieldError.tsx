"use client";

/** Checks a guest's contact fields and returns a message per field that needs fixing. */
export function checkContact(data: FormData, fields: { name: string; phone?: string; email?: string; phoneOptional?: boolean }) {
  const errors: Record<string, string> = {};
  const value = (name: string) => String(data.get(name) ?? "").trim();
  if (value(fields.name).length < 2) errors[fields.name] = "Scrivi nome e cognome.";
  if (fields.phone) {
    const digits = value(fields.phone).replace(/\D/g, "");
    if (digits.length < 6 && !(fields.phoneOptional && digits.length === 0)) {
      errors[fields.phone] = "Scrivi un numero di telefono valido: serve se il ristorante deve contattarti.";
    }
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value(fields.email))) {
    errors[fields.email] = "Scrivi un’email valida, per esempio nome@esempio.it.";
  }
  return errors;
}

/** Moves the cursor to the first field with an error and brings it into view. */
export function focusFirstError(form: HTMLFormElement, errors: Record<string, string>) {
  const first = Object.keys(errors)[0];
  const input = first ? form.querySelector<HTMLElement>(`[name="${first}"]`) : null;
  input?.focus();
  input?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  );
}
