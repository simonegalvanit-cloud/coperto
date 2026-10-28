import type { Reservation } from "@/db/schema";
import type { TableOption } from "@/lib/plan";
import { ActionForm } from "@/components/ActionForm";
import { saveReservation } from "./actions";

export function ReservationForm({
  date,
  initial,
  tables,
}: {
  date: string;
  initial?: Reservation;
  tables: TableOption[];
}) {
  return (
    <ActionForm action={saveReservation} submitLabel={initial ? "Salva le modifiche" : "Aggiungi la prenotazione"}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid-3">
        <label className="field">
          Data
          <input className="input" type="date" name="date" defaultValue={initial?.date ?? date} required />
        </label>
        <label className="field">
          Ora
          <input className="input" type="time" name="time" step={300} defaultValue={initial?.time ?? "20:00"} required />
        </label>
        <label className="field">
          Persone
          <input className="input" type="number" name="partySize" min={1} max={200} defaultValue={initial?.partySize ?? 2} required />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Nome dell’ospite
          <input className="input" name="guestName" defaultValue={initial?.guestName} autoComplete="off" required />
        </label>
        <label className="field">
          Telefono
          <input className="input" type="tel" name="guestPhone" defaultValue={initial?.guestPhone} autoComplete="off" />
        </label>
      </div>
      <label className="field">
        Email <span className="hint">Facoltativa, per mandare la conferma</span>
        <input className="input" type="email" name="guestEmail" defaultValue={initial?.guestEmail} autoComplete="off" />
      </label>
      {tables.length > 0 && (
        <label className="field">
          Tavolo <span className="hint">Facoltativo, puoi assegnarlo anche dalla sala</span>
          <select
            className="input"
            name="place"
            defaultValue={initial?.tableId ? `t:${initial.tableId}` : initial?.combinationId ? `c:${initial.combinationId}` : ""}
          >
            <option value="">Nessun tavolo</option>
            {[...new Set(tables.map((t) => t.group))].map((group) => (
              <optgroup key={group} label={group}>
                {tables
                  .filter((t) => t.group === group)
                  .map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.seats} posti)
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Note <span className="hint">Allergie, ricorrenze, richieste sul tavolo</span>
        <textarea className="input" name="notes" defaultValue={initial?.notes} />
      </label>
      {initial?.source === "online" ? (
        <input type="hidden" name="source" value="online" />
      ) : (
        <label className="field">
          Come è arrivata
          <select className="input" name="source" defaultValue={initial?.source ?? "phone"}>
            <option value="phone">Per telefono</option>
            <option value="walk_in">Senza prenotazione</option>
          </select>
        </label>
      )}
      {!initial && (
        <label className="check">
          <input type="checkbox" name="sendEmail" defaultChecked /> Manda la conferma all’ospite, se c’è l’email
        </label>
      )}
    </ActionForm>
  );
}
