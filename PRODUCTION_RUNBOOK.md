# PayGate Production Go-Live Runbook

This document describes the exact steps to migrate from development to production.

---

## Pre-Flight Checklist

Before going live, confirm all of the following:

| Item | Status |
|---|---|
| Stripe sandbox claimed at [dashboard.stripe.com/claim_sandbox](https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ) | [ ] |
| Production `DATABASE_URL` set in Settings → Secrets | [ ] |
| `JWT_SECRET` rotated from default dev value | [ ] |
| `STRIPE_SECRET_KEY` (live key, starts with `sk_live_`) set | [ ] |
| `STRIPE_WEBHOOK_SECRET` (live webhook secret) set | [ ] |
| `VITE_STRIPE_PUBLISHABLE_KEY` (live key, starts with `pk_live_`) set | [ ] |
| All three portals published via the Publish button | [ ] |
| Custom domain bound in Settings → Domains | [ ] |
| First admin user promoted in the Database panel | [ ] |

---

## Step 1: Provision the Production Database

Use a managed MySQL 8.0+ or TiDB Serverless instance.

```bash
# Example: TiDB Serverless (recommended)
# 1. Create a cluster at tidbcloud.com
# 2. Copy the connection string
# 3. Add it to Settings → Secrets as DATABASE_URL

# Example connection string format:
# mysql://user:password@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/paygate?ssl=true
```

---

## Step 2: Run Database Migrations

Run this from the merchant portal directory after setting `DATABASE_URL`:

```bash
cd /home/ubuntu/paygate-merchant-portal
DATABASE_URL="mysql://..." pnpm db:push
```

Repeat for consumer and admin portals:

```bash
cd /home/ubuntu/paygate-consumer-portal
DATABASE_URL="mysql://..." pnpm db:push

cd /home/ubuntu/paygate-admin-portal
DATABASE_URL="mysql://..." pnpm db:push
```

---

## Step 3: Seed the First Admin

```bash
cd /home/ubuntu/paygate-merchant-portal
DATABASE_URL="mysql://..." \
ADMIN_EMAIL="admin@yourcompany.com" \
ADMIN_NAME="Platform Admin" \
node scripts/seed-production-admin.mjs
```

Then promote the account in the Database panel:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@yourcompany.com';
```

---

## Step 4: Configure Stripe Live Keys

1. Complete Stripe KYC at [dashboard.stripe.com](https://dashboard.stripe.com)
2. In Settings → Secrets, update:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
3. In Stripe Dashboard → Developers → Webhooks, add endpoint:
   - URL: `https://your-domain.manus.space/api/stripe/webhook`
   - Events: `payment_intent.succeeded`, `checkout.session.completed`, `payment_intent.payment_failed`
4. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

**Test with card:** `4242 4242 4242 4242` (any future expiry, any CVV)

---

## Step 5: Publish All Portals

Click the **Publish** button in the Management UI for each portal. Ensure a checkpoint exists first.

---

## Step 6: Bind Custom Domains

In Settings → Domains for each portal:

| Portal | Suggested Domain |
|---|---|
| Merchant Portal | `merchant.yourcompany.com` |
| Consumer Portal | `app.yourcompany.com` |
| Admin Portal | `admin.yourcompany.com` |

---

## Environment Variables Reference

See `ENV_DOCS.md` for the complete list of all environment variables across all portals.

---

## Rollback Procedure

If a deployment causes issues:

1. Click **Rollback** on the previous checkpoint in the Management UI
2. The database schema is forward-only — no automatic rollback; fix forward with a new migration
3. For data corruption, restore from the managed database provider's backup

---

## Health Check Endpoints

| Portal | Endpoint | Expected Response |
|---|---|---|
| Merchant | `GET /api/health` | `{"status":"ok"}` |
| Consumer | `GET /api/health` | `{"status":"ok"}` |
| Admin | `GET /api/health` | `{"status":"ok"}` |

---

## Support

For platform issues, contact the PayGate engineering team or submit a ticket at [help.manus.im](https://help.manus.im).
