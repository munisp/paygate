# @paygate/checkout-react

PayGate hosted checkout SDK — embed a fully branded payment modal on any website with one line of code.

## Installation

```bash
npm install @paygate/checkout-react
# or
pnpm add @paygate/checkout-react
```

## React usage

```tsx
import { PayGateCheckout } from "@paygate/checkout-react";

function BuyButton() {
  return (
    <PayGateCheckout
      paymentLinkSlug="my-product-link"
      baseUrl="https://your-paygate-instance.manus.space"
      onSuccess={(session) => console.log("Paid!", session)}
      onClose={() => console.log("Modal closed")}
    >
      <button>Pay ₦5,000</button>
    </PayGateCheckout>
  );
}
```

## Vanilla JS / CDN usage

```html
<script src="https://cdn.paygate.ng/checkout.global.js"></script>
<script>
  PayGate.checkout({
    paymentLinkSlug: "my-product-link",
    baseUrl: "https://your-paygate-instance.manus.space",
    onSuccess: (session) => console.log("Paid!", session),
    onClose: () => console.log("Closed"),
  });
</script>
```

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `paymentLinkSlug` | `string` | Yes | The slug of the payment link to load |
| `baseUrl` | `string` | Yes | Your PayGate instance URL |
| `onSuccess` | `(session) => void` | No | Called when payment is completed |
| `onClose` | `() => void` | No | Called when the modal is closed |
| `children` | `ReactNode` | No | Trigger element (defaults to a Pay button) |

## How it works

The SDK opens the PayGate hosted payment page (`/pay/:slug`) in an iframe modal overlay. The hosted page handles all payment method selection, Stripe Elements, NIBSS NIP virtual account generation, USSD dial code display, and BNPL instalment plans. Communication between the iframe and the parent page uses `window.postMessage`.

## Publishing

```bash
cd packages/checkout-react
pnpm install
pnpm build
npm publish --access public
```

## License

MIT
