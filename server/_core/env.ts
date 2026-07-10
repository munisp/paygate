export const ENV = {
  // NOTE: appId and oAuthServerUrl removed — Manus OAuth replaced by Keycloak OIDC (on-premise)
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Go middleware bridge
  middlewareBridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
  middlewareInternalKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",

  // TigerBeetle ledger
  tigerbeetleAddress: process.env.TIGERBEETLE_ADDRESS ?? "tigerbeetle:3902",

  // Keycloak OIDC
  keycloakUrl: process.env.KEYCLOAK_URL ?? "",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "paygate",
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? "merchant-portal",
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  // Keycloak event listener webhook HMAC secret
  // Must match the secret configured in the http-event-listener SPI provider.
  // Generate with: openssl rand -hex 32
  keycloakWebhookSecret: process.env.KEYCLOAK_WEBHOOK_SECRET ?? "",
  // Keycloak Admin credentials — used by the nightly realm backup job
  // These are the Keycloak master realm admin username/password (not the portal user)
  keycloakAdminUser: process.env.KEYCLOAK_ADMIN ?? "admin",
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",

  // gRPC services
  grpcBridgeUrl: process.env.GRPC_BRIDGE_URL ?? "go-bridge:50051",
  grpcFraudUrl: process.env.GRPC_FRAUD_URL ?? "fraud-scoring:50052",
  grpcNotifyUrl: process.env.GRPC_NOTIFY_URL ?? "push-notification:50053",
  grpcOutboxUrl: process.env.GRPC_OUTBOX_URL ?? "outbox-relay:50054",
  grpcUssdUrl: process.env.GRPC_USSD_URL ?? "ussd-gateway:50055",
  outboxRelayGrpcUrl: process.env.OUTBOX_RELAY_GRPC_URL ?? "outbox-relay:50056",
  ussdServiceGrpcUrl: process.env.USSD_SERVICE_GRPC_URL ?? "ussd-gateway:50057",

  // Push notification service
  pushServiceUrl: process.env.PUSH_SERVICE_URL ?? "http://push-notification:8096",
  pushServiceGrpcUrl: process.env.PUSH_SERVICE_GRPC_URL ?? "push-notification:50058",
  pushServiceKey: process.env.PUSH_SERVICE_KEY ?? "",

  // Sync relay (offline POS / consumer app)
  syncRelayUrl: process.env.SYNC_RELAY_URL ?? "http://sync-relay:8097",
  syncRelayKey: process.env.SYNC_RELAY_KEY ?? "",

  // SLA escalation
  slaEscalationIntervalMs: parseInt(process.env.SLA_ESCALATION_INTERVAL_MS ?? "60000", 10),
  slaEscalationThresholdMs: parseInt(process.env.SLA_ESCALATION_THRESHOLD_MS ?? "86400000", 10),

  // Rust microservices
  inventoryEngineUrl: process.env.INVENTORY_ENGINE_URL ?? "http://inventory-engine:8091",
  loyaltyLedgerUrl: process.env.LOYALTY_LEDGER_URL ?? "http://loyalty-ledger:8092",

  // Python microservices
  payrollServiceUrl: process.env.PAYROLL_SERVICE_URL ?? "http://payroll-service:8093",
  kioskHealthUrl: process.env.KIOSK_HEALTH_URL ?? "http://kiosk-health:8096",
  fraudScoringUrl: process.env.FRAUD_SCORING_URL ?? "http://fraud-scoring:8083",
  ussdGatewayUrl: process.env.USSD_GATEWAY_URL ?? "http://ussd-gateway:8095",

  // PostgreSQL is the database of choice for PayGate.
  // PG_DATABASE_URL is the primary override (production/staging managed PG).
  // Falls back to the local dev instance when neither env var is set.
  pgDatabaseUrl: process.env.PG_DATABASE_URL ??
    (process.env.DATABASE_URL?.startsWith("postgres") ? process.env.DATABASE_URL : undefined) ??
    "postgresql://paygate_user:paygate_dev_2026@127.0.0.1:5432/paygate_db",

  // ─── Tier 1-5 Service URLs ──────────────────────────────────────────────
  creditScoringUrl: process.env.CREDIT_SCORING_URL ?? "http://credit-scoring:8100",
  fxRateFeedUrl: process.env.FX_RATE_FEED_URL ?? "http://fx-rate-feed:8095",
  reconciliationEngineUrl: process.env.RECONCILIATION_ENGINE_URL ?? "http://reconciliation-engine:8096",
  amlMonitorUrl: process.env.AML_MONITOR_URL ?? "http://aml-monitor:8097",
  aiInsightsUrl: process.env.AI_INSIGHTS_URL ?? "http://ai-insights:8098",
  fraudHeatmapUrl: process.env.FRAUD_HEATMAP_URL ?? "http://fraud-heatmap:8099",

  // ─── Tier 6-8 Service URLs ──────────────────────────────────────────────
  // Insurance premium collection
  insuranceServiceUrl: process.env.INSURANCE_SERVICE_URL ?? "http://insurance-service:8110",
  insuranceProviderUrl: process.env.INSURANCE_PROVIDER_URL ?? "https://api.leadway.com/v1",
  insuranceApiKey: process.env.INSURANCE_API_KEY ?? "",
  // Carbon credit marketplace
  carbonRegistryUrl: process.env.CARBON_REGISTRY_URL ?? "https://api.verra.org/v1",
  carbonApiKey: process.env.CARBON_API_KEY ?? "",
  // NFT loyalty badges
  nftServiceUrl: process.env.NFT_SERVICE_URL ?? "http://nft-service:8111",
  nftRpcUrl: process.env.NFT_RPC_URL ?? "https://polygon-rpc.com",
  nftContractAddress: process.env.NFT_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000",
  // BNPL v2 with credit bureau
  bnplV2ServiceUrl: process.env.BNPL_V2_SERVICE_URL ?? "http://bnpl-v2:8112",
  creditBureauUrl: process.env.CREDIT_BUREAU_URL ?? "https://api.crc.ng/v1",
  creditBureauApiKey: process.env.CREDIT_BUREAU_API_KEY ?? "",
  // Crypto on/off ramp
  cryptoRampUrl: process.env.CRYPTO_RAMP_URL ?? "http://crypto-ramp:8113",
  yellowCardApiUrl: process.env.YELLOW_CARD_API_URL ?? "https://api.yellowcard.io/v1",
  yellowCardApiKey: process.env.YELLOW_CARD_API_KEY ?? "",
  // Escrow service
  escrowServiceUrl: process.env.ESCROW_SERVICE_URL ?? "http://escrow-service:8114",
  // Bulk payment scheduler
  bulkSchedulerUrl: process.env.BULK_SCHEDULER_URL ?? "http://bulk-scheduler:8115",
  // Tax withholding engine
  taxServiceUrl: process.env.TAX_SERVICE_URL ?? "http://tax-service:8116",
  firsTinUrl: process.env.FIRS_TIN_URL ?? "https://api.firs.gov.ng/v1",
  firsApiKey: process.env.FIRS_API_KEY ?? "",
  // Regulatory sandbox
  regSandboxUrl: process.env.REG_SANDBOX_URL ?? "http://reg-sandbox:8117",
  cbnSandboxUrl: process.env.CBN_SANDBOX_URL ?? "https://sandbox.cbn.gov.ng/api/v1",
  cbnSandboxKey: process.env.CBN_SANDBOX_KEY ?? "",
  // Multi-currency wallet v2
  multiCurrencyUrl: process.env.MULTI_CURRENCY_URL ?? "http://multi-currency:8118",
  // RTGS (Real-Time Gross Settlement)
  rtgsUrl: process.env.RTGS_URL ?? "http://rtgs-service:8119",
  nibssRtgsUrl: process.env.NIBSS_RTGS_URL ?? "https://rtgs.nibss-plc.com.ng/api/v1",
  nibssRtgsKey: process.env.NIBSS_RTGS_KEY ?? "",
  // ISO 20022 message bus
  iso20022Url: process.env.ISO20022_URL ?? "http://iso20022-service:8120",
  swiftGpiUrl: process.env.SWIFT_GPI_URL ?? "https://api.swift.com/swift-apitracker/v4",
  swiftApiKey: process.env.SWIFT_API_KEY ?? "",
  // Open Finance Hub
  openFinanceUrl: process.env.OPEN_FINANCE_URL ?? "http://open-finance:8121",
  openFinanceRegistryUrl: process.env.OPEN_FINANCE_REGISTRY_URL ?? "https://directory.openbanking.org.ng/v1",
  openFinanceApiKey: process.env.OPEN_FINANCE_API_KEY ?? "",
  // White-Label SDK
  whiteLabelSdkUrl: process.env.WHITE_LABEL_SDK_URL ?? "http://white-label-sdk:8122",
  sdkCdnUrl: process.env.SDK_CDN_URL ?? "https://cdn.paygate.ng/sdk",
  // Consumer Super App
  superAppUrl: process.env.SUPER_APP_URL ?? "http://super-app:8123",
  // Lakehouse v2 (DuckDB + Delta Lake + Sedona)
  lakehouseV2Url: process.env.LAKEHOUSE_V2_URL ?? "http://lakehouse-v2-service:8125",
  // MinIO / S3-compatible object store
  s3Endpoint: process.env.S3_ENDPOINT ?? "http://minio:9000",
  s3Bucket: process.env.S3_BUCKET ?? "paygate-lakehouse",
  minioRootUser: process.env.MINIO_ROOT_USER ?? "minioadmin",
  minioRootPassword: process.env.MINIO_ROOT_PASSWORD ?? "minioadmin",
  // Apache Spark
  sparkMaster: process.env.SPARK_MASTER ?? "spark://spark-master:7077",
  sparkThriftUrl: process.env.SPARK_THRIFT_URL ?? "jdbc:hive2://spark-master:10000",
  // Trino distributed SQL
  trinoUrl: process.env.TRINO_URL ?? "http://trino:8080",
  // Payroll v2
  payrollV2Url: process.env.PAYROLL_V2_URL ?? "http://payroll-v2:8125",
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
  iso20022ParserUrl: process.env.ISO20022_PARSER_URL ?? "http://iso20022-parser:2002",
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
  nibssApiKey: process.env.NIBSS_SECRET_KEY ?? "",  // alias used by BVN cross-validation (Wave 171)
  nibssWebhookSecret: process.env.NIBSS_WEBHOOK_SECRET ?? "",
  nipApiKey: process.env.NIP_API_KEY ?? "",

  // ─── Mojaloop ─────────────────────────────────────────────────────────────
  mojaloopUrl: process.env.MOJALOOP_URL ?? "https://sandbox.mojaloop.io/v1",
  mojaloopApiKey: process.env.MOJALOOP_API_KEY ?? "",

  // ─── KYC / Identity ───────────────────────────────────────────────────────
  youverifyApiKey: process.env.YOUVERIFY_API_KEY ?? "",
  kycOcrUrl: process.env.KYC_OCR_URL ?? "http://kyc-ocr:8011",
  kycOcrRustUrl: process.env.KYC_OCR_RUST_URL ?? "http://kyc-ocr-rust:8012",
  livenessUrl: process.env.LIVENESS_URL ?? "http://liveness-detection:8013",
  livenessGatewayUrl: process.env.LIVENESS_GATEWAY_URL ?? "http://liveness-gateway:8085",
  livenessSignalUrl: process.env.LIVENESS_SIGNAL_URL ?? "http://liveness-signal-processor:8090",

  // ─── Messaging / SMS ──────────────────────────────────────────────────────
  termiiApiKey: process.env.TERMII_API_KEY ?? "",

  // ─── VTPass (Bills) ───────────────────────────────────────────────────────
  vtpassApiKey: process.env.VTPASS_API_KEY ?? "",
  vtpassSecretKey: process.env.VTPASS_SECRET_KEY ?? "",
  vtpassSandbox: process.env.VTPASS_SANDBOX === "true",

  // ─── Portal URLs ──────────────────────────────────────────────────────────
  portalTrpcUrl: process.env.PORTAL_TRPC_URL ?? "http://portal:3000/api/trpc",
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
  // NOTE: oauthServerUrl removed — Manus OAuth replaced by Keycloak OIDC (on-premise)
  // ─── Wave 77 New Feature Service URLs ─────────────────────────────────────────────
  digitalGoldUrl: process.env.DIGITAL_GOLD_URL ?? "http://digital-gold-service:9020",
  digitalGoldApiKey: process.env.DIGITAL_GOLD_API_KEY ?? "dev-gold-key",
  goldTechBaseUrl: process.env.GOLDTECH_BASE_URL ?? "https://api.goldtech.ng/v1",
  goldTechApiKey: process.env.GOLDTECH_API_KEY ?? "",
  mutualFundsUrl: process.env.MUTUAL_FUNDS_URL ?? "http://mutual-funds-service:9031",
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
  wealthAdvisorUrl: process.env.WEALTH_ADVISOR_URL ?? "http://wealth-advisor-service:9035",
  emiEngineUrl: process.env.EMI_ENGINE_URL ?? "http://emi-engine-service:9029",
  bulkCollectionsUrl: process.env.BULK_COLLECTIONS_URL ?? "http://go-bridge:8080",
  apiDocsUrl: process.env.API_DOCS_URL ?? "http://go-bridge:8080",
  salaryServiceUrl: process.env.SALARY_SERVICE_URL ?? "http://go-bridge:8080",
  privacyServiceUrl: process.env.PRIVACY_SERVICE_URL ?? "http://go-bridge:8080",
  reportsServiceUrl: process.env.REPORTS_SERVICE_URL ?? "http://go-bridge:8080",
  reportsBucketName: process.env.REPORTS_BUCKET_NAME ?? "paygate-reports",
  nodalServiceUrl: process.env.NODAL_SERVICE_URL ?? "http://go-bridge:8080",
  retailPosUrl: process.env.RETAIL_POS_URL ?? "http://go-bridge:8080",
  remittanceServiceUrl: process.env.REMITTANCE_SERVICE_URL ?? "http://remittance-service:9030",
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

  // ─── Ollama (local LLM inference) ────────────────────────────────────────
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434',
  ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL ?? 'llama3.2',
  ollamaTimeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '120000'),

  // ─── Wave 80 New Feature Service URLs ────────────────────────────────────
  openBankingV2Url: process.env.OPEN_BANKING_V2_URL ?? 'http://open-banking-v2:9040',
  openBankingV2ClientId: process.env.OPEN_BANKING_V2_CLIENT_ID ?? 'paygate-ob-client',
  openBankingV2ClientSecret: process.env.OPEN_BANKING_V2_CLIENT_SECRET ?? 'ob-secret-2026',
  carbonCreditsV2Url: process.env.CARBON_CREDITS_V2_URL ?? 'http://carbon-credits-v2:9041',
  carbonRegistryApiKey: process.env.CARBON_REGISTRY_API_KEY ?? 'carbon-registry-key-2026',
  agentBankingV4Url: process.env.AGENT_BANKING_V4_URL ?? 'http://agent-banking-v4:9042',
  superAgentV2Url: process.env.SUPER_AGENT_V2_URL ?? 'http://super-agent-v2:9043',
  escrowV2Url: process.env.ESCROW_V2_URL ?? 'http://escrow-v2:9044',
  marketplacePayUrl: process.env.MARKETPLACE_PAY_URL ?? 'http://marketplace-pay:9045',
  loyaltyV3Url: process.env.LOYALTY_V3_URL ?? 'http://loyalty-v3:9046',
  cryptoOfframpV2Url: process.env.CRYPTO_OFFRAMP_V2_URL ?? 'http://crypto-offramp-v2:9047',
  cryptoOfframpV2ApiKey: process.env.CRYPTO_OFFRAMP_V2_API_KEY ?? 'crypto-offramp-key-2026',
  nfcPayServiceUrl: process.env.NFC_PAY_SERVICE_URL ?? 'http://nfc-pay:9048',
  qrMerchantAnalyticsUrl: process.env.QR_MERCHANT_ANALYTICS_URL ?? 'http://qr-merchant-analytics:9049',
  invoiceFinancingV2Url: process.env.INVOICE_FINANCING_V2_URL ?? 'http://invoice-financing-v2:9050',
  invoiceFinancingV2ApiKey: process.env.INVOICE_FINANCING_V2_API_KEY ?? 'inv-finance-key-2026',
  payrollV3Url: process.env.PAYROLL_V3_URL ?? 'http://payroll-v3:9051',
  taxFilingServiceUrl: process.env.TAX_FILING_SERVICE_URL ?? 'http://tax-filing:9052',
  taxFilingApiKey: process.env.TAX_FILING_API_KEY ?? 'tax-filing-key-2026',
  regulatoryReportingUrl: process.env.REGULATORY_REPORTING_URL ?? 'http://regulatory-reporting:9053',
  regulatoryReportingApiKey: process.env.REGULATORY_REPORTING_API_KEY ?? 'reg-reporting-key-2026',
  usdcV2Url: process.env.USDC_V2_URL ?? 'http://usdc-v2:9054',
  multiCurrencyLedgerUrl: process.env.MULTI_CURRENCY_LEDGER_URL ?? 'http://multi-currency-ledger:9055',
  temporalWorkflowUiUrl: process.env.TEMPORAL_WORKFLOW_UI_URL ?? 'http://temporal-ui:8080',
  grpcHealthServiceUrl: process.env.GRPC_HEALTH_SERVICE_URL ?? 'http://grpc-health:9090',
  ussdSessionV2Url: process.env.USSD_SESSION_V2_URL ?? 'http://ussd-session-v2:9056',
  realtimeNotificationsUrl: process.env.REALTIME_NOTIFICATIONS_URL ?? 'http://realtime-notifications:9057',
  mobileMoneReconV2Url: process.env.MOBILE_MONEY_RECON_V2_URL ?? 'http://mobile-money-recon-v2:9058',

  // ─── Wave 32: GNN Fraud, Vector Store, Knowledge Graph, AI Orchestration ────
  gnnFraudUrl: process.env.GNN_FRAUD_URL ?? 'http://gnn-fraud:8141',
  vectorStoreUrl: process.env.VECTOR_STORE_URL ?? 'http://vector-store:8101',
  knowledgeGraphUrl: process.env.KNOWLEDGE_GRAPH_URL ?? 'http://knowledge-graph:8102',
  artReasoningUrl: process.env.ART_REASONING_URL ?? 'http://art-reasoning:8103',
  cocoindexUrl: process.env.COCOINDEX_URL ?? 'http://cocoindex:8104',
  lakehouseAiUrl: process.env.LAKEHOUSE_AI_URL ?? 'http://lakehouse-ai:8105',

  // ─── Wave 32: Partner & Tenant ───────────────────────────────────────────────
  partnerOnboardingWebhookUrl: process.env.PARTNER_ONBOARDING_WEBHOOK_URL ?? 'https://hooks.paygate.ng/partner-onboarding',
  tenantCorridorApiUrl: process.env.TENANT_CORRIDOR_API_URL ?? 'http://corridor-service:9060',
  ssoCallbackBaseUrl: process.env.SSO_CALLBACK_BASE_URL ?? 'https://portal.paygate.ng/auth/sso/callback',

  // ─── Wave 32: Prometheus / Metrics ───────────────────────────────────────────
  prometheusUrl: process.env.PROMETHEUS_URL ?? 'http://prometheus:9090',
  grafanaUrl: process.env.GRAFANA_URL ?? 'http://grafana:3000',
  alertmanagerUrl: process.env.ALERTMANAGER_URL ?? 'http://alertmanager:9093',

  // ─── Cross-border payment rails (Wave 35) ────────────────────────────────────
  // CIPS: China Interbank Payment System (CNY cross-border)
  cipsUrl: process.env.CIPS_URL ?? 'https://sandbox.cips.com.cn/api/v1',
  cipsApiKey: process.env.CIPS_API_KEY ?? '',
  // UPI: Unified Payments Interface (India, via NPCI)
  upiGatewayUrl: process.env.UPI_GATEWAY_URL ?? 'https://sandbox.npci.org.in/upi/v1',
  upiApiKey: process.env.UPI_API_KEY ?? '',
  // PIX: Brazil Instant Payment System (via BCB)
  pixGatewayUrl: process.env.PIX_GATEWAY_URL ?? 'https://sandbox.bcb.gov.br/pix/v1',
  pixApiKey: process.env.PIX_API_KEY ?? '',
  // DeepFace sidecar
  deepfaceSidecarUrl: process.env.DEEPFACE_SIDECAR_URL ?? 'http://localhost:8001',
};

// Lowercase alias for convenience — use `env` in new code
export const env = ENV;
