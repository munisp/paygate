/**
 * @paygate/checkout-react
 * Vanilla JS + React SDK for the PayGate hosted checkout modal.
 *
 * Usage (React):
 *   import { PayGateCheckout, openCheckout } from '@paygate/checkout-react';
 *   <PayGateCheckout publicKey="pk_live_xxx" amount={5000} currency="NGN" email="...">
 *     <button>Pay Now</button>
 *   </PayGateCheckout>
 *
 * Usage (vanilla JS via CDN):
 *   <script src="https://js.paygate.africa/v1/checkout.js"></script>
 *   <script>PayGate.checkout({ publicKey: 'pk_live_xxx', amount: 5000, ... })</script>
 */

export { openCheckout } from "./sdk";
export type { PayGateCheckoutConfig } from "./sdk";
export { PayGateCheckout } from "./PayGateCheckout";
export type { PayGateCheckoutProps } from "./PayGateCheckout";
