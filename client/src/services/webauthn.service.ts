/**
 * WebAuthn / Biometric Authentication Service
 * Adapted from the PayGate PWA archive for the merchant portal.
 * Uses @simplewebauthn/browser for cross-browser compatibility.
 */

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";

export interface WebAuthnSupportResult {
  supported: boolean;
  platformAuthenticatorAvailable: boolean;
  error?: string;
}

export interface WebAuthnRegistrationResult {
  success: boolean;
  credentialId?: string;
  error?: string;
}

export interface WebAuthnAuthenticationResult {
  success: boolean;
  credentialId?: string;
  error?: string;
}

const STORAGE_KEY = "paygate_webauthn_credentials";

function getStoredCredentials(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function storeCredential(credentialId: string) {
  const existing = getStoredCredentials();
  if (!existing.includes(credentialId)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, credentialId]));
  }
}

export const webAuthnService = {
  async isSupported(): Promise<WebAuthnSupportResult> {
    const supported = browserSupportsWebAuthn();
    if (!supported) {
      return { supported: false, platformAuthenticatorAvailable: false, error: "WebAuthn not supported in this browser" };
    }
    const platformAvailable = await platformAuthenticatorIsAvailable();
    return { supported: true, platformAuthenticatorAvailable: platformAvailable };
  },

  hasRegisteredCredential(): boolean {
    return getStoredCredentials().length > 0;
  },

  async register(username: string): Promise<WebAuthnRegistrationResult> {
    try {
      // Generate a challenge locally (in production this comes from the server)
      const challenge = btoa(crypto.getRandomValues(new Uint8Array(32)).join(","));
      const userId = btoa(username);

      const registrationResponse = await startRegistration({
        optionsJSON: {
          challenge,
          rp: { name: "PayGate", id: window.location.hostname },
          user: { id: userId, name: username, displayName: username },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      });

      const credentialId = registrationResponse.id;
      storeCredential(credentialId);
      return { success: true, credentialId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      return { success: false, error: msg };
    }
  },

  async authenticate(): Promise<WebAuthnAuthenticationResult> {
    try {
      const stored = getStoredCredentials();
      if (stored.length === 0) {
        return { success: false, error: "No registered credentials found" };
      }

      const challenge = btoa(crypto.getRandomValues(new Uint8Array(32)).join(","));

      const authResponse = await startAuthentication({
        optionsJSON: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: stored.map((id) => ({ id, type: "public-key" as const })),
          userVerification: "required",
          timeout: 60000,
        },
      });

      return { success: true, credentialId: authResponse.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      return { success: false, error: msg };
    }
  },

  clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
