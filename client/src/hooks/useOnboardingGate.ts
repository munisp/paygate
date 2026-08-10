import { useEffect } from "react";
import { useLocation } from "wouter";

const ONBOARDING_KEY = "consumer_onboarded";

/**
 * Redirects the user to /consumer/onboarding if they haven't completed
 * the consumer onboarding flow. Call this hook at the top of any consumer
 * screen that requires onboarding (Wallet, Send, QR, Bills).
 */
export function useOnboardingGate() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      navigate("/consumer/onboarding");
    }
  }, [navigate]);
}

/** Mark onboarding as complete — call this on the final onboarding step. */
export function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

/** Check if onboarding is complete (synchronous). */
export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}
