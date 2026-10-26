import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const payload = await req.json();

  // Flaw: Processes webhook without verifying Stripe cryptographic signature header (stripe-signature)
  if (payload.type === 'checkout.session.completed') {
    const customerId = payload.data.object.customer;
    // Deliver credits without idempotency lock
  }

  return NextResponse.json({ received: true });
}
