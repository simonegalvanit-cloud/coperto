import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { requireAccount } from "@/lib/auth";
import { billingState, eur, IVA, PLANS, type PlanId, withIva } from "@/lib/billing";
import { COMPANY } from "@/lib/legal";
import { paymentsEnabled } from "@/lib/stripe";
import { openPortal, startCheckout, updateBilling } from "./actions";

export const metadata: Metadata = { title: "Abbonamento" };

const day = (d: Date) => new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(d);

/** The owner's subscription: trial, plan choice, invoice details, and Stripe for card and invoices. */
export default async function SubscriptionPage({ searchParams }: PageProps<"/app/abbonamento">) {
  const { restaurant: r } = await requireAccount("account");
  const state = billingState(r);
  const justActivated = (await searchParams).attivato === "1";
  const subscribed = state.kind === "active" || state.kind === "past_due";

  const billingFields = (
    <div className="grid-2">
      <label className="field">
        Ragione sociale
        <input className="input" name="billingName" defaultValue={r.billingName || r.name} required />
      </label>
      <label className="field">
        Partita IVA
        <input className="input" name="billingVat" defaultValue={r.billingVat} inputMode="numeric" placeholder="11 cifre" required />
      </label>
      <label className="field">
        Codice fiscale <span className="hint">Se diverso dalla P.IVA</span>
        <input className="input" name="billingTaxCode" defaultValue={r.billingTaxCode} />
      </label>
      <label className="field">
        Sede legale <span className="hint">Via, CAP, città</span>
        <input className="input" name="billingAddress" defaultValue={r.billingAddress || [r.address, r.city].filter(Boolean).join(", ")} required />
      </label>
      <label className="field">
        Codice destinatario SDI <span className="hint">7 caratteri</span>
        <input className="input" name="billingSdi" defaultValue={r.billingSdi} maxLength={7} />
      </label>
      <label className="field">
        Oppure PEC
        <input className="input" type="email" name="billingPec" defaultValue={r.billingPec} />
      </label>
    </div>
  );

  return (
    <>
      <h1>Abbonamento</h1>
      {justActivated && (
        <p className="panel form-ok">Grazie! Stiamo attivando l’abbonamento: tra pochi secondi lo vedi qui sotto.</p>
      )}

      <section className="panel settings-section">
        <header>
          <h2>
            {state.kind === "trial" && `Prova gratuita: ${state.daysLeft === 1 ? "ultimo giorno" : `mancano ${state.daysLeft} giorni`}`}
            {state.kind === "comp" && "Accesso gratuito"}
            {state.kind === "active" && `Piano ${PLANS[state.plan].name} ${state.interval === "year" ? "annuale" : "mensile"}`}
            {state.kind === "past_due" && "Pagamento non riuscito"}
            {state.kind === "expired" && (state.reason === "trial_over" ? "La prova gratuita è finita" : "Abbonamento terminato")}
          </h2>
          <p className="muted">
            {state.kind === "trial" && `Fino al ${day(state.endsAt)} hai tutto Coperto, gratis e senza carta. Scegli un piano quando vuoi: l’addebito parte solo alla fine della prova.`}
            {state.kind === "comp" && `${COMPANY.name} ti ha dato accesso gratuito fino al ${day(state.until)}.`}
            {state.kind === "active" &&
              (state.cancelling
                ? `Hai disdetto: resta attivo fino al ${state.renewsAt ? day(state.renewsAt) : "fine periodo"}.`
                : state.renewsAt
                  ? `Si rinnova il ${day(state.renewsAt)}.`
                  : "Attivo.")}
            {state.kind === "past_due" && "Non siamo riusciti ad addebitare l’ultimo pagamento. Coperto continua a funzionare mentre riproviamo: aggiorna la carta per non interromperlo."}
            {state.kind === "expired" && "Le prenotazioni online sono in pausa; tutti i tuoi dati sono al sicuro. Scegli un piano per ripartire subito."}
          </p>
        </header>
        {subscribed && (
          <form action={openPortal}>
            <button type="submit" className={`btn${state.kind === "past_due" ? " btn-fill" : ""}`}>
              {state.kind === "past_due" ? "Aggiorna la carta" : "Carta, fatture, cambio piano o disdetta"}
            </button>
          </form>
        )}
      </section>

      {!subscribed && (
        <section className="panel settings-section">
          <header>
            <h2>Scegli il piano</h2>
            <p className="muted">Prezzi più IVA ({IVA}%). Disdici quando vuoi, senza penali.</p>
          </header>
          {!paymentsEnabled() && (
            <p className="form-error">I pagamenti online non sono ancora attivi: puoi comunque inserire i dati, ti contattiamo noi.</p>
          )}
          <ActionForm action={startCheckout} submitLabel="Continua al pagamento sicuro" pendingLabel="Ti portiamo al pagamento…">
            <div className="plan-grid">
              {(Object.keys(PLANS) as PlanId[]).flatMap((id) =>
                (["month", "year"] as const).map((interval) => {
                  const p = PLANS[id];
                  const price = p[interval];
                  return (
                    <label key={`${id}_${interval}`} className="plan-option">
                      <input type="radio" name="choice" value={`${id}_${interval}`} defaultChecked={id === (r.plan ?? "sala") && interval === "month"} required />
                      <span>
                        <strong>{p.name} {interval === "year" ? "annuale" : "mensile"}</strong>
                        {interval === "year" && <span className="tag tag-ok" style={{ marginLeft: 6 }}>2 mesi gratis</span>}
                        <span className="big-price">{eur(price)} + IVA {interval === "year" ? "all’anno" : "al mese"}</span>
                        <span className="small muted">{eur(withIva(price))} IVA inclusa · {p.blurb}</span>
                      </span>
                    </label>
                  );
                }),
              )}
            </div>
            <h3>Dati per la fattura</h3>
            {billingFields}
          </ActionForm>
          <p className="small muted">
            Il pagamento è gestito da Stripe: Coperto non vede né conserva i dati della carta. Gruppi e più sedi: scrivici, prepariamo un’offerta su misura.
          </p>
        </section>
      )}

      {subscribed && (
        <section className="panel settings-section">
          <header>
            <h2>Dati per la fattura</h2>
          </header>
          <ActionForm action={updateBilling} submitLabel="Salva">
            {billingFields}
          </ActionForm>
        </section>
      )}
    </>
  );
}
