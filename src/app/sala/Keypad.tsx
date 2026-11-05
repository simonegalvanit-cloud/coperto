"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { pinLogin } from "./actions";

const LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** "Chi sei?" then a big keypad: built for a thumb on a tablet in the middle of service. */
export function Keypad({ team }: { team: { id: string; name: string }[] }) {
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState("");
  const [state, run, pending] = useActionState(pinLogin, null);

  // Sends as soon as the sixth digit is in, and clears the digits ready for the next try.
  const press = (key: string) => {
    if (!who || pending) return;
    if (key === "⌫") return setPin(pin.slice(0, -1));
    const next = pin + key;
    if (next.length < LENGTH) return setPin(next);
    setPin("");
    const data = new FormData();
    data.set("member", who.id);
    data.set("pin", next);
    startTransition(() => run(data));
  };

  // A physical keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const filled = pending ? LENGTH : pin.length;

  if (!who) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <h2>Chi sei?</h2>
        <div className="who-grid">
          {team.map((m) => (
            <button key={m.id} type="button" className="btn" onClick={() => setWho(m)}>
              {m.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="spread">
        <h2>Ciao {who.name}</h2>
        <button type="button" className="btn btn-small btn-quiet" onClick={() => { setWho(null); setPin(""); }}>
          Non sono io
        </button>
      </div>
      <p className="muted">Il tuo PIN di {LENGTH} cifre</p>
      <div className="pin-dots" aria-label={`${filled} cifre su ${LENGTH}`}>
        {Array.from({ length: LENGTH }, (_, i) => <span key={i} className={i < filled ? "on" : ""} />)}
      </div>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="keypad">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className="btn"
              disabled={pending}
              aria-label={k === "⌫" ? "Cancella" : k}
              onClick={() => press(k)}
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
