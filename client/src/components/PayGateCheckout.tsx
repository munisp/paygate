import React, { useCallback } from "react";
import { openCheckout, type PayGateCheckoutConfig } from "@/lib/paygate-checkout-sdk";

export interface PayGateCheckoutProps extends PayGateCheckoutConfig {
  children: React.ReactNode;
  className?: string;
}

export function PayGateCheckout({ children, className, ...config }: PayGateCheckoutProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openCheckout(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.publicKey, config.amount, config.currency, config.email, config.reference]);

  return (
    <span className={className} onClick={handleClick} style={{ cursor: "pointer", display: "inline-block" }}>
      {children}
    </span>
  );
}
export default PayGateCheckout;
