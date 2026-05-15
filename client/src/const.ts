export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Generate the Keycloak SSO login URL at runtime.
 *
 * This platform is designed for on-premise / private-cloud deployment.
 * Keycloak is the ONLY supported identity provider — there is no Manus OAuth
 * dependency or any other cloud-hosted auth service.
 *
 * The server endpoint /api/auth/keycloak/login initiates the Keycloak
 * Authorization Code flow and redirects the browser to Keycloak.
 * After authentication, Keycloak redirects back to /api/oauth/callback
 * which issues an HS256 session cookie and redirects to /dashboard.
 *
 * For local development without Keycloak, the email/password login form
 * on the Login page calls trpc.auth.login directly and issues the same
 * HS256 session cookie format without any SSO redirect.
 */
export const getLoginUrl = (returnPath?: string): string => {
  const url = new URL("/api/auth/keycloak/login", window.location.origin);
  url.searchParams.set("origin", window.location.origin);
  if (returnPath) url.searchParams.set("return", returnPath);
  return url.toString();
};
