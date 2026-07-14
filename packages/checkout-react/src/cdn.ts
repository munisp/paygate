/**
 * CDN entry point — exposes a global `PayGate` object for script-tag usage.
 *
 * Usage:
 *   <script src="https://js.paygate.africa/v1/checkout.js"></script>
 *   <script>
 *     PayGate.checkout({
 *       publicKey: 'pk_live_xxx',
 *       email: 'customer@example.com',
 *       amount: 500000,
 *       currency: 'NGN',
 *       onSuccess: function(data) { console.log('Paid!', data.reference); },
 *     });
 *   </script>
 */
import { openCheckout, PayGateCheckoutConfig } from "./sdk";

declare global {
  interface Window {
    PayGate: {
      checkout: (config: PayGateCheckoutConfig) => void;
      version: string;
    };
  }
}

window.PayGate = {
  checkout: openCheckout,
  version: "1.0.0",
};
