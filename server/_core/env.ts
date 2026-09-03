/**
 * Centralised server environment configuration.
 *
 * Every externally-sourced setting the server needs is declared here so that
 * missing configuration is visible at startup (see validateServerEnv)
 * instead of surfacing as a silent mock fallback deep in a money path.
 */

export const ENV = {
  // ── Core ──────────────────────────────────────────────────────────────────
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oauthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  paygateApiUrl: process.env.PAYGATE_API_URL ?? "http://localhost:4000",
  merchantPortalUrl: process.env.MERCHANT_PORTAL_URL ?? "",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  port: parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? "3000", 10),

  // ── Middleware bridge (Go services: Temporal/TigerBeetle/Kafka/Dapr/…) ────
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",

  // ── Permify (PBAC authorization) ─────────────────────────────────────────
  permifyUrl: process.env.PERMIFY_URL ?? "",
  permifyApiKey: process.env.PERMIFY_API_KEY ?? "",

  // ── Keycloak (OIDC identity) ─────────────────────────────────────────────
  keycloakUrl: process.env.KEYCLOAK_URL ?? "",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "paygate",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  keycloakAdminUser: process.env.KEYCLOAK_ADMIN ?? "admin",
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "",
  keycloakWebhookSecret: process.env.KEYCLOAK_WEBHOOK_SECRET ?? "",

  // ── Stripe (card acquiring / portal billing) ─────────────────────────────
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePortalPlanStarterPriceId: process.env.STRIPE_PORTAL_STARTER_PRICE_ID ?? "",
  stripePortalPlanGrowthPriceId: process.env.STRIPE_PORTAL_GROWTH_PRICE_ID ?? "",
  stripePortalPlanEnterprisePriceId: process.env.STRIPE_PORTAL_ENTERPRISE_PRICE_ID ?? "",

  // ── Kafka / Fluvio (event bus) ───────────────────────────────────────────
  kafkaBootstrapServers: process.env.KAFKA_BOOTSTRAP_SERVERS ?? "",
  fluvioEndpoint: process.env.FLUVIO_ENDPOINT ?? "",

  // ── Redis (cache / idempotency / rate limit) ─────────────────────────────
  redisUrl: process.env.REDIS_URL ?? "",

  // ── SMTP (transactional email) ───────────────────────────────────────────
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",

  // ── Temporal (workflow orchestration) ────────────────────────────────────
  temporalHostPort: process.env.TEMPORAL_HOST_PORT ?? "",
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "default",

  // ── TigerBeetle (double-entry ledger) ────────────────────────────────────
  tigerbeetleAddress: process.env.TIGERBEETLE_URL ?? process.env.TIGERBEETLE_ADDRESS ?? "",

  // ── APISIX (API gateway) ─────────────────────────────────────────────────
  apisixAdminUrl: process.env.APISIX_ADMIN_URL ?? "",
  apisixApiKey: process.env.APISIX_API_KEY ?? "",

  // ── Payment rails ────────────────────────────────────────────────────────
  nibssGatewayUrl: process.env.NIBSS_GATEWAY_URL ?? "",
  nibssInstitutionCode: process.env.NIBSS_INSTITUTION_CODE ?? "",
  nibssApiKey: process.env.NIBSS_API_KEY ?? "",
  mojaloopUrl: process.env.MOJALOOP_URL ?? "",
  mojaloopApiKey: process.env.MOJALOOP_API_KEY ?? "",
  pixGatewayUrl: process.env.PIX_GATEWAY_URL ?? "",
  pixApiKey: process.env.PIX_API_KEY ?? "",
  upiGatewayUrl: process.env.UPI_GATEWAY_URL ?? "",
  upiApiKey: process.env.UPI_API_KEY ?? "",
  cipsUrl: process.env.CIPS_URL ?? "",
  cipsApiKey: process.env.CIPS_API_KEY ?? "",
  ussdGatewayUrl: process.env.USSD_GATEWAY_URL ?? "",

  // ── Internal microservices ───────────────────────────────────────────────
  fraudScoringUrl: process.env.FRAUD_SCORING_URL ?? "",
  gnnFraudUrl: process.env.GNN_FRAUD_URL ?? "",
  creditScoringUrl: process.env.CREDIT_SCORING_URL ?? "",
  livenessGatewayUrl: process.env.LIVENESS_GATEWAY_URL ?? "",
  livenessUrl: process.env.LIVENESS_URL ?? process.env.LIVENESS_GATEWAY_URL ?? "",
  kycOcrUrl: process.env.KYC_OCR_URL ?? "",
  kycOcrRustUrl: process.env.KYC_OCR_RUST_URL ?? "",
  kioskHealthUrl: process.env.KIOSK_HEALTH_URL ?? "",
  inventoryEngineUrl: process.env.INVENTORY_ENGINE_URL ?? "",
  loyaltyLedgerUrl: process.env.LOYALTY_LEDGER_URL ?? "",
  payrollServiceUrl: process.env.PAYROLL_SERVICE_URL ?? "",

  // ── Novu (alert notifications — OTEL spec §7) ────────────────────────────
  novuApiUrl: process.env.NOVU_API_URL ?? "http://novu-api:3000",
  novuApiKey: process.env.NOVU_API_KEY ?? "",

  // ── AP/AR suite services (Melio wave) ────────────────────────────────────
  accountingSyncUrl: process.env.ACCOUNTING_SYNC_URL ?? "http://accounting-sync:8107",
  billInboxUrl: process.env.BILL_INBOX_URL ?? "http://bill-inbox:8108",
  artReasoningUrl: process.env.ART_REASONING_URL ?? "http://art-reasoning:8103",
  accountingTokenKey: process.env.ACCOUNTING_TOKEN_KEY ?? "",
  billInboxToken: process.env.BILL_INBOX_TOKEN ?? "",

  // ── Observability ────────────────────────────────────────────────────────
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? "paygate-portal",

  // ── SMS/OTP providers ────────────────────────────────────────────────────
  termiiApiKey: process.env.TERMII_API_KEY ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
} as const;

/** Lowercase alias kept for modules that `import { env } from "../_core/env"`. */
export const env = ENV;

export type EnvKey = keyof typeof ENV;

/**
 * Startup validation. In production, missing critical configuration is a
 * hard failure (fail closed); in development it logs loud warnings.
 *
 * Critical in production: DATABASE_URL and JWT_SECRET. Everything else is
 * integration-specific and degrades to explicit SERVICE_UNAVAILABLE at the
 * call site — but we still warn so operators see the gaps at boot.
 */
export function validateServerEnv(): void {
  const missingCritical: string[] = [];
  if (!process.env.DATABASE_URL) missingCritical.push("DATABASE_URL");
  if (!process.env.JWT_SECRET) missingCritical.push("JWT_SECRET");

  const recommended: Array<[string, string]> = [
    ["MIDDLEWARE_BRIDGE_URL", ENV.middlewareBridgeUrl],
    ["MIDDLEWARE_INTERNAL_KEY", ENV.middlewareInternalKey],
    ["PERMIFY_URL", ENV.permifyUrl],
    ["KEYCLOAK_URL", ENV.keycloakUrl],
    ["STRIPE_SECRET_KEY", ENV.stripeSecretKey],
    ["KAFKA_BOOTSTRAP_SERVERS", ENV.kafkaBootstrapServers],
    ["REDIS_URL", ENV.redisUrl],
    ["SMTP_HOST", ENV.smtpHost],
  ];
  const missingRecommended = recommended.filter(([, v]) => !v).map(([k]) => k);

  if (missingRecommended.length > 0) {
    console.warn(
      `[ENV] Optional integrations not configured (related features will fail loud at call time): ${missingRecommended.join(", ")}`,
    );
  }

  if (missingCritical.length > 0) {
    const msg = `[ENV] Missing critical environment variables: ${missingCritical.join(", ")}`;
    if (ENV.isProduction) {
      throw new Error(`${msg} — refusing to boot in production (fail closed).`);
    }
    console.warn(`${msg} — server will run but DB-backed endpoints will throw.`);
  }
}
