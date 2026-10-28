"use client";

import { startTransition, useActionState, type ReactNode } from "react";

export type ActionResult = { error?: string; ok?: string } | null;

/**
 * A form wired to a server action that shows the action's error or success message.
 * Submits through onSubmit rather than the `action` prop so React doesn't clear
 * the fields when the server sends back an error.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Un attimo…",
  className = "stack",
  wide = false,
}: {
  action: (prev: ActionResult, data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  wide?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {children}
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      {state?.ok && <p className="form-ok" role="status">{state.ok}</p>}
      <div>
        <button className={`btn btn-fill${wide ? " btn-wide" : ""}`} type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
