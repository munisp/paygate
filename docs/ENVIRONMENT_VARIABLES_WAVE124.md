# Environment Variables — Wave 124

This document describes all environment variables introduced in Wave 124 for the new services: Bill Payments Gateway, Carbon Credit Registry, Subscription Engine, QR Payment Generator, POS Terminal Manager, Referral Engine, USSD Gateway, Purchase Order Workflow, Insurance Claims Processor, Loan Repayment Engine, Coupon Engine, Saved Beneficiaries Cache, and Device Push Token Registry.

---

## Bill Payments Gateway

| Variable | Required | Description | Example |
|---|---|---|---|
| `VTPASS_API_KEY` | Yes | VTPass API key for bill payments (airtime, electricity, cable TV) | `vtpass_live_abc123` |
| `VTPASS_SECRET_KEY` | Yes | VTPass secret key for request signing | `vtpass_secret_xyz789` |
| `VTPASS_SANDBOX` | No | Enable VTPass sandbox mode for testing (default: `true`) | `false` |
| `NIBSS_GATEWAY_URL` | Yes | NIBSS gateway URL for NIP-based bill payments | `https://nibss-gateway.ng/api/v1` |
| `NIBSS_INSTITUTION_CODE` | Yes | Institution code assigned by NIBSS | `000001` |
| `NIBSS_SECRET_KEY` | Yes | NIBSS secret key for request signing | `nibss_secret_abc123` |
| `NIBSS_WEBHOOK_SECRET` | Yes | NIBSS webhook signature verification secret | `nibss_webhook_secret_xyz` |

---

## Carbon Credit Registry

| Variable | Required | Description | Example |
|---|---|---|---|
| `CARBON_MARKET_API_URL` | No | Carbon market price feed API URL (default: Verra registry) | `https://api.carbonregistry.com` |
| `CARBON_MARKET_API_KEY` | Yes (prod) | API key for carbon market price feed | `carbon_api_key_abc123` |

---

## Subscription Engine

The Subscription Engine reuses existing variables:

| Variable | Source | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe integration | Used for Stripe subscription sync |
| `STRIPE_WEBHOOK_SECRET` | Stripe integration | Used for Stripe webhook verification |
| `TEMPORAL_HOST_PORT` | Core infrastructure | Temporal workflow server address |
| `TEMPORAL_NAMESPACE` | Core infrastructure | Temporal namespace for subscription workflows |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email service | Used for renewal reminder emails |

---

## QR Payment Generator

| Variable | Required | Description | Example |
|---|---|---|---|
| `PAYMENT_LINK_BASE_URL` | Yes | Base URL for QR payment deep links | `https://pay.paygate.ng` |
| `QR_CODE_TTL_SECONDS` | No | QR code expiry in seconds (default: `300`) | `600` |

---

## POS Terminal Manager

| Variable | Required | Description | Example |
|---|---|---|---|
| `POS_FIRMWARE_BUCKET` | No | S3 bucket name for POS firmware files (default: `paygate-pos-firmware`) | `paygate-pos-firmware-prod` |

---

## Referral Engine

| Variable | Required | Description | Example |
|---|---|---|---|
| `REFERRAL_REWARD_KOBO` | No | Default referral reward in kobo (default: `50000` = ₦500) | `100000` |
| `MAX_REFERRAL_DEPTH` | No | Maximum referral chain depth (default: `3`) | `5` |

---

## USSD Gateway

| Variable | Required | Description | Example |
|---|---|---|---|
| `USSD_GATEWAY_URL` | Yes | External USSD aggregator gateway URL | `https://ussd.africaistalking.com/api/v1` |
| `SESSION_TTL_SECONDS` | No | USSD session timeout in seconds (default: `120`) | `180` |
| `MAX_MENU_DEPTH` | No | Maximum USSD menu nesting depth (default: `5`) | `7` |

---

## Purchase Order Workflow

The Purchase Order Workflow reuses existing variables:

| Variable | Source | Description |
|---|---|---|
| `TEMPORAL_HOST_PORT` | Core infrastructure | Temporal workflow server address |
| `TEMPORAL_NAMESPACE` | Core infrastructure | Temporal namespace for PO approval workflows |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email service | Used for PO approval notification emails |
| `PAYOUT_APPROVER_EMAIL` | Core configuration | Default approver email for high-value POs |

---

## Insurance Claims Processor

| Variable | Required | Description | Example |
|---|---|---|---|
| `YOUVERIFY_API_KEY` | Yes | YouVerify API key for insurance KYC verification | `youverify_key_abc123` |

---

## Device Push Token Registry

| Variable | Required | Description | Example |
|---|---|---|---|
| `PUSH_SERVICE_URL` | Yes | Push notification service URL | `https://push.paygate.ng/api/v1` |
| `PUSH_SERVICE_KEY` | Yes | Push notification service API key | `push_key_abc123` |
| `VAPID_PUBLIC_KEY` | Yes | VAPID public key for Web Push notifications | `BNcRdreALRFXTkOOUHK...` |
| `VAPID_PRIVATE_KEY` | Yes | VAPID private key for Web Push notifications | `uyfNITIpa57XoBiuhQ...` |
| `VAPID_SUBJECT` | Yes | VAPID subject (mailto: or URL) | `mailto:push@paygate.ng` |

---

## Security & Rate Limiting

| Variable | Required | Description | Example |
|---|---|---|---|
| `DDOS_MAX_REQUESTS_PER_MINUTE` | No | DDoS rate limit per IP per minute (default: `100`) | `200` |
| `RANSOMWARE_BULK_DELETE_THRESHOLD` | No | Max bulk-delete ops before ransomware guard triggers (default: `50`) | `25` |
| `COUPON_CACHE_TTL_SECONDS` | No | Coupon validation cache TTL in seconds (default: `300`) | `600` |
| `BENEFICIARY_CACHE_TTL_SECONDS` | No | Saved beneficiaries cache TTL in seconds (default: `3600`) | `7200` |

---

## Summary of New Variables by Category

| Category | New Variables | Reused Variables |
|---|---|---|
| Bill Payments | `VTPASS_API_KEY`, `VTPASS_SECRET_KEY`, `VTPASS_SANDBOX` | `NIBSS_GATEWAY_URL`, `NIBSS_INSTITUTION_CODE`, `NIBSS_SECRET_KEY`, `NIBSS_WEBHOOK_SECRET` |
| Carbon Credits | `CARBON_MARKET_API_URL`, `CARBON_MARKET_API_KEY` | — |
| Subscriptions | — | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TEMPORAL_*`, `SMTP_*` |
| QR Payments | `PAYMENT_LINK_BASE_URL`, `QR_CODE_TTL_SECONDS` | — |
| POS Terminals | `POS_FIRMWARE_BUCKET` | — |
| Referral Engine | `REFERRAL_REWARD_KOBO`, `MAX_REFERRAL_DEPTH` | — |
| USSD Gateway | `USSD_GATEWAY_URL`, `SESSION_TTL_SECONDS`, `MAX_MENU_DEPTH` | — |
| Purchase Orders | — | `TEMPORAL_*`, `SMTP_*`, `PAYOUT_APPROVER_EMAIL` |
| Insurance Claims | `YOUVERIFY_API_KEY` | — |
| Device Push Tokens | `PUSH_SERVICE_URL`, `PUSH_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | — |
| Security | `DDOS_MAX_REQUESTS_PER_MINUTE`, `RANSOMWARE_BULK_DELETE_THRESHOLD` | — |
| Caching | `COUPON_CACHE_TTL_SECONDS`, `BENEFICIARY_CACHE_TTL_SECONDS` | — |

---

## Notes

1. All monetary amounts are stored in **kobo** (NGN smallest unit). 100 kobo = ₦1.
2. All timestamps are stored as **UTC Unix milliseconds** at the database layer.
3. The `VTPASS_SANDBOX` variable should be set to `false` in production after KYC verification with VTPass.
4. VAPID keys can be generated using: `npx web-push generate-vapid-keys`
5. The `CARBON_MARKET_API_KEY` is only required in production. In development, the system uses mock price data.
