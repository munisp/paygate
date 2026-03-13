export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Go middleware bridge — used for payout approval workflow orchestration.
  // When empty (local dev / sandbox), the portal falls back to direct DB
  // operations so the UI remains fully functional without the bridge running.
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
  // Keycloak OIDC — replaces Manus OAuth for merchant authentication.
  // When KEYCLOAK_URL is empty the portal falls back to Manus OAuth so
  // the sandbox remains functional without a Keycloak instance.
  keycloakUrl: process.env.KEYCLOAK_URL ?? "",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "paygate",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "merchant-portal",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  // Stripe — payment processing
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
};
