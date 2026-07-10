import React from "react";
import { openCheckout, PayGateCheckoutConfig } from "./sdk";

export interface PayGateCheckoutProps extends PayGateCheckoutConfig {
  /** The trigger element — clicking it opens the checkout modal */
  children: React.ReactNode;
  /** Extra class name for the wrapper span */
  className?: string;
}

/**
 * React wrapper around the PayGate checkout SDK.
 *
 * @example
 * <PayGateCheckout
 *   publicKey="pk_live_xxx"
 *   email="customer@example.com"
 *   amount={500000}
 *   currency="NGN"
 *   onSuccess={({ reference }) => console.log("Paid!", reference)}
 * >
 *   <button className="btn-primary">Pay ₦5,000</button>
 * </PayGateCheckout>
 */
export function PayGateCheckout({ children, className, ...config }: PayGateCheckoutProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openCheckout(config);
  };

  return (
    <span
      onClick={handleClick}
      className={className}
      style={{ cursor: "pointer", display: "inline-block" }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openCheckout(config)}
    >
      {children}
    </span>
  );
}
