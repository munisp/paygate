/**
 * WebAuthn / Biometric Authentication Service
 * Adapted from the PayGate PWA archive for the merchant portal.
 * Implemented directly on the native Web Authentication API
 * (navigator.credentials / PublicKeyCredential).
 */

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function browserSupportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

async function platformAuthenticatorIsAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

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
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(username);

      const credential = (await navigator.credentials.create({
        publicKey: {
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
      })) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, error: "Registration was cancelled" };
      }
      const credentialId = credential.id;
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

      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: stored.map((id) => ({
            id: base64UrlToBuffer(id),
            type: "public-key" as const,
          })),
          userVerification: "required",
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, error: "Authentication was cancelled" };
      }
      return { success: true, credentialId: credential.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      return { success: false, error: msg };
    }
  },

  clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
