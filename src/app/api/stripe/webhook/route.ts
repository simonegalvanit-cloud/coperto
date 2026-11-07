import Stripe from "stripe";
import { handleStripeEvent } from "@/lib/stripe-events";

/**
 * Stripe calls this when a subscription starts, renews, fails or ends. Only requests signed with
 * STRIPE_WEBHOOK_SECRET are accepted, so nobody else can mark a restaurant as paid.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook non configurato", { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Firma non valida", { status: 400 });
  }
  await handleStripeEvent(event);
  return Response.json({ received: true });
}
