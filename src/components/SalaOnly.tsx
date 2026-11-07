import Link from "next/link";
import { PLANS, eur } from "@/lib/billing";

/** Shown instead of a Sala feature to restaurants on Banco. */
export function SalaOnly({ feature, owner }: { feature: string; owner: boolean }) {
  return (
    <div className="panel drawing stack" style={{ maxWidth: 640 }}>
      <h1>{feature}</h1>
      <p>
        È inclusa nel piano <strong>Sala</strong> ({eur(PLANS.sala.month)} + IVA al mese), insieme a schede ospite, pianta in tempo reale e
        tavoli uniti.
      </p>
      {owner ? (
        <p>
          <Link className="btn btn-fill" href="/app/abbonamento">Passa a Sala</Link>
        </p>
      ) : (
        <p className="muted">Per attivarla chiedi al titolare.</p>
      )}
    </div>
  );
}
