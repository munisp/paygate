export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Go middleware bridge
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",

  // TigerBeetle ledger
  tigerbeetleAddress: process.env.TIGERBEETLE_ADDRESS ?? "127.0.0.1:3902",

  // Keycloak OIDC
  keycloakUrl: process.env.KEYCLOAK_URL ?? "",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "paygate",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "merchant-portal",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",

  // gRPC services
  grpcBridgeUrl: process.env.GRPC_BRIDGE_URL ?? "localhost:50051",
  grpcFraudUrl: process.env.GRPC_FRAUD_URL ?? "localhost:50052",
  grpcNotifyUrl: process.env.GRPC_NOTIFY_URL ?? "localhost:50053",
  grpcOutboxUrl: process.env.GRPC_OUTBOX_URL ?? "localhost:50054",
  grpcUssdUrl: process.env.GRPC_USSD_URL ?? "localhost:50055",
  outboxRelayGrpcUrl: process.env.OUTBOX_RELAY_GRPC_URL ?? "localhost:50056",
  ussdServiceGrpcUrl: process.env.USSD_SERVICE_GRPC_URL ?? "localhost:50057",

  // Push notification service
  pushServiceUrl: process.env.PUSH_SERVICE_URL ?? "http://localhost:8096",
  pushServiceGrpcUrl: process.env.PUSH_SERVICE_GRPC_URL ?? "localhost:50058",
  pushServiceKey: process.env.PUSH_SERVICE_KEY ?? "",

  // Sync relay (offline POS / consumer app)
  syncRelayUrl: process.env.SYNC_RELAY_URL ?? "http://localhost:8097",
  syncRelayKey: process.env.SYNC_RELAY_KEY ?? "",

  // SLA escalation
  slaEscalationIntervalMs: parseInt(process.env.SLA_ESCALATION_INTERVAL_MS ?? "60000", 10),
  slaEscalationThresholdMs: parseInt(process.env.SLA_ESCALATION_THRESHOLD_MS ?? "86400000", 10),

  // Rust microservices
  inventoryEngineUrl: process.env.INVENTORY_ENGINE_URL ?? "http://localhost:8091",
  loyaltyLedgerUrl: process.env.LOYALTY_LEDGER_URL ?? "http://localhost:8092",

  // Python microservices
  payrollServiceUrl: process.env.PAYROLL_SERVICE_URL ?? "http://localhost:8093",
  kioskHealthUrl: process.env.KIOSK_HEALTH_URL ?? "http://localhost:8094",
  fraudScoringUrl: process.env.FRAUD_SCORING_URL ?? "http://localhost:8083",
  ussdGatewayUrl: process.env.USSD_GATEWAY_URL ?? "http://localhost:8095",

  // PostgreSQL direct connection (Go bridge / Rust crate)
  pgDatabaseUrl: process.env.PG_DATABASE_URL ?? process.env.DATABASE_URL ?? "",

  // ─── Tier 1-5 Service URLs ──────────────────────────────────────────────
  creditScoringUrl: process.env.CREDIT_SCORING_URL ?? "http://localhost:8100",
  fxRateFeedUrl: process.env.FX_RATE_FEED_URL ?? "http://localhost:8101",
  reconciliationEngineUrl: process.env.RECONCILIATION_ENGINE_URL ?? "http://localhost:8102",
  amlMonitorUrl: process.env.AML_MONITOR_URL ?? "http://localhost:8103",
  aiInsightsUrl: process.env.AI_INSIGHTS_URL ?? "http://localhost:8104",
  fraudHeatmapUrl: process.env.FRAUD_HEATMAP_URL ?? "http://localhost:8105",

  // ─── Tier 6-8 Service URLs ──────────────────────────────────────────────
  // Insurance premium collection
  insuranceServiceUrl: process.env.INSURANCE_SERVICE_URL ?? "http://localhost:8110",
  insuranceProviderUrl: process.env.INSURANCE_PROVIDER_URL ?? "https://api.leadway.com/v1",
  insuranceApiKey: process.env.INSURANCE_API_KEY ?? "",
  // Carbon credit marketplace
  carbonRegistryUrl: process.env.CARBON_REGISTRY_URL ?? "https://api.verra.org/v1",
  carbonApiKey: process.env.CARBON_API_KEY ?? "",
  // NFT loyalty badges
  nftServiceUrl: process.env.NFT_SERVICE_URL ?? "http://localhost:8111",
  nftRpcUrl: process.env.NFT_RPC_URL ?? "https://polygon-rpc.com",
  nftContractAddress: process.env.NFT_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  // BNPL v2 with credit bureau
  bnplV2ServiceUrl: process.env.BNPL_V2_SERVICE_URL ?? "http://localhost:8112",
  creditBureauUrl: process.env.CREDIT_BUREAU_URL ?? "https://api.crc.ng/v1",
  creditBureauApiKey: process.env.CREDIT_BUREAU_API_KEY ?? "",
  // Crypto on/off ramp
  cryptoRampUrl: process.env.CRYPTO_RAMP_URL ?? "http://localhost:8113",
  yellowCardApiUrl: process.env.YELLOW_CARD_API_URL ?? "https://api.yellowcard.io/v1",
  yellowCardApiKey: process.env.YELLOW_CARD_API_KEY ?? "",
  // Escrow service
  escrowServiceUrl: process.env.ESCROW_SERVICE_URL ?? "http://localhost:8114",
  // Bulk payment scheduler
  bulkSchedulerUrl: process.env.BULK_SCHEDULER_URL ?? "http://localhost:8115",
  // Tax withholding engine
  taxServiceUrl: process.env.TAX_SERVICE_URL ?? "http://localhost:8116",
  firsTinUrl: process.env.FIRS_TIN_URL ?? "https://api.firs.gov.ng/v1",
  firsApiKey: process.env.FIRS_API_KEY ?? "",
  // Regulatory sandbox
  regSandboxUrl: process.env.REG_SANDBOX_URL ?? "http://localhost:8117",
  cbnSandboxUrl: process.env.CBN_SANDBOX_URL ?? "https://sandbox.cbn.gov.ng/api/v1",
  cbnSandboxKey: process.env.CBN_SANDBOX_KEY ?? "",
  // Multi-currency wallet v2
  multiCurrencyUrl: process.env.MULTI_CURRENCY_URL ?? "http://localhost:8118",
  // RTGS (Real-Time Gross Settlement)
  rtgsUrl: process.env.RTGS_URL ?? "http://localhost:8119",
  nibssRtgsUrl: process.env.NIBSS_RTGS_URL ?? "https://rtgs.nibss-plc.com.ng/api/v1",
  nibssRtgsKey: process.env.NIBSS_RTGS_KEY ?? "",
  // ISO 20022 message bus
  iso20022Url: process.env.ISO20022_URL ?? "http://localhost:8120",
  swiftGpiUrl: process.env.SWIFT_GPI_URL ?? "https://api.swift.com/swift-apitracker/v4",
  swiftApiKey: process.env.SWIFT_API_KEY ?? "",
  // Open Finance Hub
  openFinanceUrl: process.env.OPEN_FINANCE_URL ?? "http://localhost:8121",
  openFinanceRegistryUrl: process.env.OPEN_FINANCE_REGISTRY_URL ?? "https://directory.openbanking.org.ng/v1",
  openFinanceApiKey: process.env.OPEN_FINANCE_API_KEY ?? "",
  // White-Label SDK
  whiteLabelSdkUrl: process.env.WHITE_LABEL_SDK_URL ?? "http://localhost:8122",
  sdkCdnUrl: process.env.SDK_CDN_URL ?? "https://cdn.paygate.ng/sdk",
  // Consumer Super App
  superAppUrl: process.env.SUPER_APP_URL ?? "http://localhost:8123",
  // Lakehouse v2
  lakehouseV2Url: process.env.LAKEHOUSE_V2_URL ?? "http://localhost:8124",
  deltaLakeUrl: process.env.DELTA_LAKE_URL ?? "http://localhost:8998",
  sparkThriftUrl: process.env.SPARK_THRIFT_URL ?? "jdbc:hive2://localhost:10000",
  // Payroll v2
  payrollV2Url: process.env.PAYROLL_V2_URL ?? "http://localhost:8125",
  pensionAdminUrl: process.env.PENSION_ADMIN_URL ?? "https://api.pencom.gov.ng/v1",
  pensionApiKey: process.env.PENSION_API_KEY ?? "",
  nhfUrl: process.env.NHF_URL ?? "https://api.fmbn.gov.ng/v1",
  nhfApiKey: process.env.NHF_API_KEY ?? "",
  // Settlement Forecast
  settlementForecastUrl: process.env.SETTLEMENT_FORECAST_URL ?? "http://settlement-forecast:9010",
  // Carbon Oracle
  carbonOracleUrl: process.env.CARBON_ORACLE_URL ?? "http://carbon-oracle:9011",
  // Insurance Pricing
  insurancePricingUrl: process.env.INSURANCE_PRICING_URL ?? "http://insurance-pricing:9012",
  // Tax Engine
  taxEngineUrl: process.env.TAX_ENGINE_URL ?? "http://tax-engine:9013",
  // ISO 20022 Parser
  iso20022ParserUrl: process.env.ISO20022_PARSER_URL ?? "http://iso20022-parser:9014",
  // Cohort Analytics
  cohortAnalyticsUrl: process.env.COHORT_ANALYTICS_URL ?? "http://cohort-analytics:9015",
  // Agent Banking v3 (via Go bridge)
  agentBankingV3Url: process.env.AGENT_BANKING_V3_URL ?? "http://go-bridge:8080",
  // Loyalty Merchant (via Go bridge)
  loyaltyMerchantUrl: process.env.LOYALTY_MERCHANT_URL ?? "http://go-bridge:8080",
  // SDK Relay (via Go bridge)
  sdkRelayUrl: process.env.SDK_RELAY_URL ?? "http://go-bridge:8080",

  // ─── NIBSS / NIP defaults ──────────────────────────────────────────────────
  nibssGatewayUrl: process.env.NIBSS_GATEWAY_URL ?? "https://nibss-plc.com.ng/nip/v1",
  nibssInstitutionCode: process.env.NIBSS_INSTITUTION_CODE ?? "000000",
  nibssSecretKey: process.env.NIBSS_SECRET_KEY ?? "",
  nibssWebhookSecret: process.env.NIBSS_WEBHOOK_SECRET ?? "",
  nipApiKey: process.env.NIP_API_KEY ?? "",

  // ─── Mojaloop ─────────────────────────────────────────────────────────────
  mojaloopUrl: process.env.MOJALOOP_URL ?? "https://sandbox.mojaloop.io/v1",
  mojaloopApiKey: process.env.MOJALOOP_API_KEY ?? "",

  // ─── KYC / Identity ───────────────────────────────────────────────────────
  youverifyApiKey: process.env.YOUVERIFY_API_KEY ?? "",

  // ─── Messaging / SMS ──────────────────────────────────────────────────────
  termiiApiKey: process.env.TERMII_API_KEY ?? "",

  // ─── VTPass (Bills) ───────────────────────────────────────────────────────
  vtpassApiKey: process.env.VTPASS_API_KEY ?? "",
  vtpassSecretKey: process.env.VTPASS_SECRET_KEY ?? "",
  vtpassSandbox: process.env.VTPASS_SANDBOX === "true",

  // ─── Portal URLs ──────────────────────────────────────────────────────────
  portalTrpcUrl: process.env.PORTAL_TRPC_URL ?? "http://localhost:3000/api/trpc",
  merchantPortalUrl: process.env.MERCHANT_PORTAL_URL ?? "https://portal.paygate.ng",
  paymentLinkBaseUrl: process.env.PAYMENT_LINK_BASE_URL ?? "https://pay.paygate.ng",

  // ─── Payout approver ──────────────────────────────────────────────────────
  payoutApproverEmail: process.env.PAYOUT_APPROVER_EMAIL ?? "payouts@paygate.ng",

  // ─── OpenTelemetry ────────────────────────────────────────────────────────
  otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector:4317",
  otelServiceName: process.env.OTEL_SERVICE_NAME ?? "paygate-portal",

  // ─── Permify ──────────────────────────────────────────────────────────────
  permifyUrl: process.env.PERMIFY_URL ?? "http://permify:3476",
  permifyApiKey: process.env.PERMIFY_API_KEY ?? "",

  // ─── Redis ────────────────────────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL ?? "redis://redis:6379",

  // ─── Temporal ─────────────────────────────────────────────────────────────
  temporalHostPort: process.env.TEMPORAL_HOST_PORT ?? "temporal:7233",
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? "paygate",

  // ─── SMTP ─────────────────────────────────────────────────────────────────
  smtpHost: process.env.SMTP_HOST ?? "smtp.sendgrid.net",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpUser: process.env.SMTP_USER ?? "apikey",
  smtpPass: process.env.SMTP_PASS ?? "",

  // ─── VAPID (Web Push) ─────────────────────────────────────────────────────
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:push@paygate.ng",

  // ─── OAuth ────────────────────────────────────────────────────────────────
  oauthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  // ─── Wave 77 New Feature Service URLs ─────────────────────────────────────
  digitalGoldUrl: process.env.DIGITAL_GOLD_URL ?? "http://digital-gold-service:9020",
  digitalGoldApiKey: process.env.DIGITAL_GOLD_API_KEY ?? "dev-gold-key",
  goldTechBaseUrl: process.env.GOLDTECH_BASE_URL ?? "https://api.goldtech.ng/v1",
  goldTechApiKey: process.env.GOLDTECH_API_KEY ?? "",
  mutualFundsUrl: process.env.MUTUAL_FUNDS_URL ?? "http://mutual-funds-service:9021",
  cowryWiseBaseUrl: process.env.COWRYWISE_BASE_URL ?? "https://api.cowrywise.com/v1",
  cowryWiseApiKey: process.env.COWRYWISE_API_KEY ?? "",
  consumerInsuranceUrl: process.env.CONSUMER_INSURANCE_URL ?? "http://go-bridge:8080",
  aonInsuranceUrl: process.env.AON_INSURANCE_URL ?? "https://api.aon.ng/v1",
  aonInsuranceApiKey: process.env.AON_INSURANCE_API_KEY ?? "",
  pensionServiceUrl: process.env.PENSION_SERVICE_URL ?? "http://go-bridge:8080",
  pencomApiUrl: process.env.PENCOM_API_URL ?? "https://api.pencom.gov.ng/v1",
  pencomApiKey: process.env.PENCOM_API_KEY ?? "",
  cashbackServiceUrl: process.env.CASHBACK_SERVICE_URL ?? "http://go-bridge:8080",
  soundboxServiceUrl: process.env.SOUNDBOX_SERVICE_URL ?? "http://go-bridge:8080",
  soundboxMqttBroker: process.env.SOUNDBOX_MQTT_BROKER ?? "mqtt://mqtt-broker:1883",
  wealthAdvisorUrl: process.env.WEALTH_ADVISOR_URL ?? "http://wealth-advisor-service:9022",
  emiEngineUrl: process.env.EMI_ENGINE_URL ?? "http://emi-engine-service:9023",
  bulkCollectionsUrl: process.env.BULK_COLLECTIONS_URL ?? "http://go-bridge:8080",
  apiDocsUrl: process.env.API_DOCS_URL ?? "http://go-bridge:8080",
  salaryServiceUrl: process.env.SALARY_SERVICE_URL ?? "http://go-bridge:8080",
  privacyServiceUrl: process.env.PRIVACY_SERVICE_URL ?? "http://go-bridge:8080",
  reportsServiceUrl: process.env.REPORTS_SERVICE_URL ?? "http://go-bridge:8080",
  reportsBucketName: process.env.REPORTS_BUCKET_NAME ?? "paygate-reports",
  nodalServiceUrl: process.env.NODAL_SERVICE_URL ?? "http://go-bridge:8080",
  retailPosUrl: process.env.RETAIL_POS_URL ?? "http://go-bridge:8080",
  remittanceServiceUrl: process.env.REMITTANCE_SERVICE_URL ?? "http://remittance-service:9024",
  flutterwaveBaseUrl: process.env.FLUTTERWAVE_BASE_URL ?? "https://api.flutterwave.com/v3",
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  worldRemitBaseUrl: process.env.WORLDREMIT_BASE_URL ?? "https://api.worldremit.com/v1",
  worldRemitApiKey: process.env.WORLDREMIT_API_KEY ?? "",
  subscriptionV2Url: process.env.SUBSCRIPTION_V2_URL ?? "http://go-bridge:8080",
  stripePortalPlanStarterPriceId: process.env.STRIPE_PORTAL_STARTER_PRICE_ID ?? "price_starter_monthly",
  stripePortalPlanGrowthPriceId: process.env.STRIPE_PORTAL_GROWTH_PRICE_ID ?? "price_growth_monthly",
  stripePortalPlanEnterprisePriceId: process.env.STRIPE_PORTAL_ENTERPRISE_PRICE_ID ?? "price_enterprise_monthly",
  stripePortalSuccessUrl: process.env.STRIPE_PORTAL_SUCCESS_URL ?? "https://portal.paygate.ng/billing?success=1",
  stripePortalCancelUrl: process.env.STRIPE_PORTAL_CANCEL_URL ?? "https://portal.paygate.ng/billing?cancelled=1",
};
