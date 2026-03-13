export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Generate the login URL at runtime.
 *
 * - If VITE_KEYCLOAK_URL is set → redirect to /api/auth/keycloak/login on the
 *   server, which initiates the Keycloak Authorization Code flow.
 * - Otherwise → fall back to Manus OAuth portal (legacy sandbox behaviour).
 */
export const getLoginUrl = (returnPath?: string): string => {
  const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;

  if (keycloakUrl) {
    const url = new URL("/api/auth/keycloak/login", window.location.origin);
    url.searchParams.set("origin", window.location.origin);
    if (returnPath) url.searchParams.set("return", returnPath);
    return url.toString();
  }

  // Manus OAuth fallback
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};
