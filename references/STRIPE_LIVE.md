# Stripe Live Key Swap — Step-by-Step Guide

This document describes the exact steps required to move PayGate Merchant Portal from Stripe **test/sandbox mode** to **live mode** after Stripe KYC verification is complete.

---

## Prerequisites

Before starting, confirm all of the following:

| Requirement | How to verify |
|---|---|
| Stripe KYC approved | Stripe Dashboard → Account → Verification shows "Verified" |
| Live keys available | Stripe Dashboard → Developers → API keys shows `sk_live_*` and `pk_live_*` |
| Stripe Products created | Stripe Dashboard → Products — Starter, Growth, Enterprise plans exist with monthly prices |
| Site deployed (not just dev) | Manus Management UI → Dashboard shows the site is published |
| Webhook endpoint reachable | `curl -X POST https://your-site.manus.space/api/stripe/webhook` returns `{"error":"No signature"}` (not 404) |

---

## Step 1 — Swap API Keys in Manus Secrets

Navigate to **Management UI → Settings → Secrets** and update the following three secrets:

| Secret | Old value (test) | New value (live) |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_test_...` | *(new — see Step 3)* |

> **Important:** Do not update `STRIPE_WEBHOOK_SECRET` yet — the live webhook endpoint must be registered first (Step 3) to obtain the correct signing secret.

After saving, the site will automatically restart and pick up the new keys.

---

## Step 2 — Create Stripe Products and Prices

In the Stripe Dashboard (live mode), create the three portal subscription plans:

1. Go to **Products → Add product**
2. Create each plan with the following settings:

| Plan | Name | Monthly Price (USD) | Billing |
|---|---|---|---|
| Starter | PayGate Starter | $29.00 | Monthly recurring |
| Growth | PayGate Growth | $79.00 | Monthly recurring |
| Enterprise | PayGate Enterprise | $199.00 | Monthly recurring |

3. After creating each product, copy the **Price ID** (format: `price_1ABC...`).

---

## Step 3 — Register the Live Webhook Endpoint

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Set the endpoint URL to: `https://your-site.manus.space/api/stripe/webhook`
3. Select the following events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Click **Add endpoint**
5. On the webhook detail page, click **Reveal signing secret** and copy the `whsec_live_...` value

---

## Step 4 — Update Remaining Secrets

Back in **Management UI → Settings → Secrets**, update:

| Secret | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | The `whsec_live_...` value from Step 3 |
| `STRIPE_PORTAL_STARTER_PRICE_ID` | Price ID for Starter plan from Step 2 |
| `STRIPE_PORTAL_GROWTH_PRICE_ID` | Price ID for Growth plan from Step 2 |
| `STRIPE_PORTAL_ENTERPRISE_PRICE_ID` | Price ID for Enterprise plan from Step 2 |

---

## Step 5 — Verify the Integration

1. **Check key mode banner** — Visit the Billing page in the portal. The "Stripe Sandbox" banner should disappear and the plan cards should show real prices.
2. **Test a real checkout** — Use a real card (or the Stripe test card `4242 4242 4242 4242` in live mode with a 99% promo code) to complete a checkout session.
3. **Confirm webhook delivery** — In Stripe Dashboard → Developers → Webhooks → your endpoint, check that `checkout.session.completed` was received with a `200` response.
4. **Check subscription in DB** — Run the following query in Management UI → Database to confirm the subscription was recorded:

```sql
SELECT id, stripe_customer_id, stripe_subscription_id, plan, status
FROM portal_subscriptions
ORDER BY created_at DESC
LIMIT 5;
```

---

## Rollback Plan

If live mode causes issues, revert by swapping the three key secrets back to their `sk_test_*` / `pk_test_*` / `whsec_test_*` values in Settings → Secrets. The site will restart automatically and return to sandbox mode within ~30 seconds.

---

## Promo Code for Live Testing

Stripe provides a **99% discount promo code** for live mode acceptance testing. Locate it in:

> Stripe Dashboard → Coupons → `LIVETEST99`

Apply it at checkout to complete a real transaction for $0.29 (Starter plan) without charging a real card.

> **Note:** Stripe requires a minimum charge of $0.50 USD. The 99% promo on the $29 Starter plan results in $0.29, which is below the minimum. Use the Growth plan ($79 → $0.79) or Enterprise plan ($199 → $1.99) for live acceptance tests.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Checkout session creation fails with `No such price` | Price IDs not updated | Re-check `STRIPE_PORTAL_*_PRICE_ID` secrets |
| Webhook returns 400 signature mismatch | Wrong `STRIPE_WEBHOOK_SECRET` | Re-copy the signing secret from the live endpoint detail page |
| Billing page still shows "Sandbox" banner | `STRIPE_SECRET_KEY` still `sk_test_*` | Update the secret and wait for server restart |
| Subscription not recorded in DB after checkout | Webhook not firing or wrong events selected | Check Stripe Dashboard → Webhooks → event log for delivery failures |

For persistent issues, see **Stripe Dashboard → Developers → Webhooks → Investigate** for full request/response logs.
