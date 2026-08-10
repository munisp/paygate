# @paygate/js — PayGate JavaScript SDK

Embeddable checkout, wallet widget, and payment status for web applications.

## Installation

```bash
npm install @paygate/js
# or
yarn add @paygate/js
```

Or load from CDN:
```html
<script src="https://cdn.paygate.ng/sdk/v1/paygate.umd.js"></script>
```

## Quick Start

```typescript
import { PaygateSDK } from "@paygate/js";

const paygate = new PaygateSDK({
  publicKey: "pk_test_xxxxxxxxxxxxxxxx",
  environment: "sandbox",
  onSuccess: (data) => {
    console.log("Payment successful:", data.reference);
  },
  onError: (err) => {
    console.error("Payment failed:", err.message);
  },
});

paygate.openCheckout({
  amount: 5000_00, // Amount in kobo (₦5,000)
  currency: "NGN",
  email: "customer@example.com",
  name: "John Doe",
  description: "Order #12345",
  channels: ["card", "bank_transfer", "ussd"],
});
```

## Wallet Widget

```typescript
import { mountWalletWidget } from "@paygate/js/widget";

const cleanup = mountWalletWidget({
  publicKey: "pk_test_xxxxxxxxxxxxxxxx",
  containerId: "wallet-container",
  showBalance: true,
  showTransactions: true,
  theme: "light",
  currency: "NGN",
  onTopUp: () => paygate.openCheckout({ amount: 100000 }),
});

// Unmount when done
cleanup();
```

## Payment Status Badge

```typescript
import { mountPaymentStatusBadge } from "@paygate/js/widget";

mountPaymentStatusBadge(
  {
    publicKey: "pk_test_xxxxxxxxxxxxxxxx",
    reference: "PG-1234567890-ABC",
    containerId: "status-badge",
    pollInterval: 3000,
  },
  (status) => {
    if (status === "success") redirectToSuccessPage();
  }
);
```

## Inline Checkout

```typescript
import { renderInlineCheckout } from "@paygate/js/checkout";

renderInlineCheckout(
  "checkout-container",
  {
    publicKey: "pk_test_xxxxxxxxxxxxxxxx",
    amount: 250000,
    email: "user@example.com",
  },
  (event) => {
    if (event.type === "PAYGATE_SUCCESS") {
      console.log("Paid!", event.data);
    }
  }
);
```

## Test Cards

| Card Number | Expiry | CVV | Result |
|---|---|---|---|
| 4084 0840 8408 4081 | Any future | Any | Success |
| 4084 0840 8408 4099 | Any future | Any | Insufficient funds |
| 5399 8383 8383 8381 | Any future | Any | Success (Mastercard) |

## Support

- Docs: https://docs.paygate.ng
- Email: developers@paygate.ng
- Status: https://status.paygate.ng
