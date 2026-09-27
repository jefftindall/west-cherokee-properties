/** Ensure a Stripe customer exists for a renter; persist id on the person row. */
export async function ensureStripeCustomer({ stripe, store, person }) {
  let customerId = String(person.stripeCustomerId || '').trim();
  if (customerId) return customerId;

  const customer = await stripe.customers.create({
    email: person.email,
    name: person.displayName,
  });
  customerId = customer.id;
  await store.updatePersonStripeCustomerId(person.id, customerId);
  return customerId;
}
