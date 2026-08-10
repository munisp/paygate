/**
 * BiometricAuth Component
 * Adapted from PayGate PWA archive — uses @simplewebauthn/browser.
 * Supports Face ID, Touch ID, Windows Hello.
 */
import { useState, useEffect } from "react";
import { Fingerprint, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { webAuthnService, WebAuthnSupportResult } from "@/services/webauthn.service";

export interface BiometricAuthProps {
  username?: string;
  onSuccess?: (credentialId: string) => void;
  onError?: (error: string) => void;
  mode?: "register" | "authenticate";
  className?: string;
}

export function BiometricAuth({
  username,
  onSuccess,
  onError,
  mode = "authenticate",
  className = "",
}: BiometricAuthProps) {
  const [support, setSupport] = useState<WebAuthnSupportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    webAuthnService.isSupported().then(setSupport);
    setIsRegistered(webAuthnService.hasRegisteredCredential());
  }, []);

  const handleAction = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") {
        const result = await webAuthnService.register(username || "user");
        if (result.success && result.credentialId) {
          setSuccess(true);
          setIsRegistered(true);
          onSuccess?.(result.credentialId);
        } else {
          setError(result.error || "Registration failed");
          onError?.(result.error || "Registration failed");
        }
      } else {
        const result = await webAuthnService.authenticate();
        if (result.success && result.credentialId) {
          setSuccess(true);
          onSuccess?.(result.credentialId);
        } else {
          setError(result.error || "Authentication failed");
          onError?.(result.error || "Authentication failed");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (!support) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground text-sm ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking biometric support…
      </div>
    );
  }

  if (!support.supported || !support.platformAuthenticatorAvailable) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground text-sm ${className}`}>
        <AlertCircle className="w-4 h-4 text-amber-500" />
        Biometric authentication not available on this device
      </div>
    );
  }

  if (success) {
    return (
      <div className={`flex items-center gap-2 text-emerald-600 text-sm font-medium ${className}`}>
        <ShieldCheck className="w-4 h-4" />
        {mode === "register" ? "Biometric registered successfully" : "Authenticated successfully"}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {error && (
        <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <Button
        variant="outline"
        onClick={handleAction}
        disabled={loading || (mode === "authenticate" && !isRegistered)}
        className="w-full gap-2"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Fingerprint className="w-4 h-4" />
        )}
        {loading
          ? "Verifying…"
          : mode === "register"
          ? "Register Biometric"
          : isRegistered
          ? "Sign in with Biometrics"
          : "No biometric registered"}
      </Button>
      {mode === "authenticate" && !isRegistered && (
        <p className="text-xs text-muted-foreground text-center">
          Go to Security Settings to register your biometric
        </p>
      )}
    </div>
  );
}
