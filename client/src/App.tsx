// @ts-nocheck
import { lazy, Suspense } from "react";
import OfflineIndicator from "@/components/OfflineIndicator";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PWAUpdateToast } from "@/components/PWAUpdateToast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";

// ── Core layout (eager — always needed) ──────────────────────────────────────
import Layout from "./components/Layout";
import { AdminGuard } from "./components/RoleGuard";

// ── Auth pages (eager — first render) ────────────────────────────────────────
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import AcceptInvite from "./pages/AcceptInvite";

// ── Consumer layout (eager — consumer shell) ─────────────────────────────────
import ConsumerLayout from "./pages/consumer/ConsumerLayout";
import EMIManagement from "./pages/EMIManagement";
import SubscriptionManagement from "./pages/SubscriptionManagement";
import PartnerAdminDashboard from "./pages/PartnerAdminDashboard";
import TenantBrandingAdmin from "./pages/TenantBrandingAdmin";
import PartnerOnboardingWizard from "./pages/partner/PartnerOnboarding";
import GoldSIP from "./pages/GoldSIP";
import ConsumerLoyaltyApp from "./pages/ConsumerLoyaltyApp";
import WebhookLiveStream from "./pages/WebhookLiveStream";
import MiddlewareDashboard from "./pages/MiddlewareDashboard";
import FraudAlertsDashboard from "./pages/FraudAlertsDashboard";
import WebhookSimulator from "./pages/Webhooks/WebhookSimulator";
import WAFAlertDashboard from "./pages/WAFAlertDashboard";
import BNPLCalculator from "./pages/BNPLCalculator";
import InsuranceHub from "./pages/InsuranceHub";
import RemittanceTracker from "./pages/RemittanceTracker";

// ── Lazy page loader helper ───────────────────────────────────────────────────
const lz = (fn: () => Promise<any>) => lazy(fn);

// ── Merchant pages ────────────────────────────────────────────────────────────
const Dashboard = lz(() => import("./pages/Dashboard"));
const Transactions = lz(() => import("./pages/Transactions"));
const Customers = lz(() => import("./pages/Customers"));
const VirtualCards = lz(() => import("./pages/VirtualCards"));
const Analytics = lz(() => import("./pages/Analytics"));
const MerchantAnalyticsDashboard = lz(() => import("./pages/MerchantAnalyticsDashboard"));
const Checkout = lz(() => import("./pages/Checkout"));
const APIKeys = lz(() => import("./pages/APIKeys"));
const Webhooks = lz(() => import("./pages/Webhooks"));
const WebhookDeliveries = lz(() => import("./pages/WebhookDeliveries"));
const Settings = lz(() => import("./pages/Settings"));
const Payouts = lz(() => import("./pages/Payouts"));
const USDCPayouts = lz(() => import("./pages/USDCPayouts"));
const Disputes = lz(() => import("./pages/Disputes"));
const DisputeWorkflow = lz(() => import("./pages/DisputeWorkflow"));
const PaymentLinks = lz(() => import("./pages/PaymentLinks"));
const FraudRisk = lz(() => import("./pages/FraudRisk"));
const ReconciliationAlerts = lz(() => import("./pages/ReconciliationAlerts"));
const BNPL = lz(() => import("./pages/BNPL"));
const FXDashboard = lz(() => import("./pages/FXDashboard"));
const TeamRoles = lz(() => import("./pages/TeamRoles"));
const MobileMoneyRecon = lz(() => import("./pages/MobileMoneyRecon"));
const ComplianceKYC = lz(() => import("./pages/ComplianceKYC"));
const ComplianceSettings = lz(() => import("./pages/ComplianceSettings"));
const QRPayments = lz(() => import("./pages/QRPayments"));
const CrossBorder = lz(() => import("./pages/CrossBorder"));
const DeveloperPortal = lz(() => import("./pages/DeveloperPortal"));
const WorkflowObservability = lz(() => import("./pages/WorkflowObservability"));
const KeycloakRoleSync = lz(() => import("./pages/KeycloakRoleSync"));
const NIPBanks = lz(() => import("./pages/NIPBanks"));
const Subscriptions = lz(() => import("./pages/Subscriptions"));
const POSTerminals = lz(() => import("./pages/POSTerminals"));
const TerminalMap = lz(() => import("./pages/TerminalMap"));
const POSReconciliation = lz(() => import("./pages/POSReconciliation"));
const PTSPSettlement = lz(() => import("./pages/PTSPSettlement"));
const PtspBatches = lz(() => import("./pages/PtspBatches"));
const AgentBanking = lz(() => import("./pages/AgentBanking"));
const KioskHealth = lz(() => import("./pages/KioskHealth"));
const RestaurantFloorPlan = lz(() => import("./pages/RestaurantFloorPlan"));
const RestaurantOrders = lz(() => import("./pages/RestaurantOrders"));
const RestaurantMenu = lz(() => import("./pages/RestaurantMenu"));
const RestaurantLoyalty = lz(() => import("./pages/RestaurantLoyalty"));
const RestaurantOnlineOrdering = lz(() => import("./pages/RestaurantOnlineOrdering").then(m => ({ default: m.default })));
const PublicOrderPageLazy = lz(() => import("./pages/RestaurantOnlineOrdering").then(m => ({ default: m.PublicOrderPage })));
const KitchenDisplay = lz(() => import("./pages/KitchenDisplay"));
const Inventory = lz(() => import("./pages/Inventory"));
const Payroll = lz(() => import("./pages/Payroll"));
const GeofenceAlerts = lz(() => import("./pages/GeofenceAlerts"));
const MicroserviceHealth = lz(() => import("./pages/MicroserviceHealth"));
const AdminSetup = lz(() => import("./pages/AdminSetup"));
const OllamaChat = lz(() => import("./pages/OllamaChat"));
const GoLiveChecklist = lz(() => import("./pages/GoLiveChecklist"));
const SettingsPayments = lz(() => import("./pages/SettingsPayments"));
const QuickPay = lz(() => import("./pages/QuickPay"));
const NotificationsCenter = lz(() => import("./pages/NotificationsCenter"));
const MerchantNotificationPreferences = lz(() => import("./pages/MerchantNotificationPreferences"));
const AuditLog = lz(() => import("./pages/AuditLog"));
const PurchaseOrders = lz(() => import("./pages/PurchaseOrders"));
const Vendors = lz(() => import("./pages/Vendors"));
const Settlements = lz(() => import("./pages/Settlements"));
const MerchantLending = lz(() => import("./pages/MerchantLending"));
const SplitPayments = lz(() => import("./pages/SplitPayments"));
const RefundWorkflow = lz(() => import("./pages/RefundWorkflow"));
const PayoutBatching = lz(() => import("./pages/PayoutBatching"));
const TransactionReceipt = lz(() => import("./pages/TransactionReceipt"));
const SettlementForecast = lz(() => import("./pages/SettlementForecast"));
const TaxEngine = lz(() => import("./pages/TaxEngine"));
const MobilePOS = lz(() => import("./pages/MobilePOS"));
const Billing = lz(() => import("./pages/Billing"));
const ConsumerAnalytics = lz(() => import("./pages/ConsumerAnalytics"));
const ConsumerDisputes = lz(() => import("./pages/ConsumerDisputes"));

// ── Tier 1-5 pages ────────────────────────────────────────────────────────────
const RecurringBilling = lz(() => import("./pages/tier1to5/RecurringBilling"));
const DCCDashboard = lz(() => import("./pages/tier1to5/DCCDashboard"));
const ReconciliationEngine = lz(() => import("./pages/tier1to5/ReconciliationEngine"));
const InvoiceBuilder = lz(() => import("./pages/tier1to5/InvoiceBuilder"));
const ChargebackAutomation = lz(() => import("./pages/tier1to5/ChargebackAutomation"));
const AMLMonitor = lz(() => import("./pages/tier1to5/AMLMonitor"));
const KYBWorkflow = lz(() => import("./pages/tier1to5/KYBWorkflow"));
const SessionRisk = lz(() => import("./pages/tier1to5/SessionRisk"));
const OpenBanking = lz(() => import("./pages/tier1to5/OpenBanking"));
const LoyaltyEngine = lz(() => import("./pages/tier1to5/LoyaltyEngine"));
const EmbeddedFinance = lz(() => import("./pages/tier1to5/EmbeddedFinance"));
const AIInsights = lz(() => import("./pages/tier1to5/AIInsights"));
const FraudHeatmap = lz(() => import("./pages/tier1to5/FraudHeatmap"));
const CohortAnalytics = lz(() => import("./pages/tier1to5/CohortAnalytics"));
const DisputeAutomation = lz(() => import("./pages/tier1to5/DisputeAutomation"));
const OpenBankingPortal = lz(() => import("./pages/tier1to5/OpenBankingPortal"));
const MerchantLendingV2 = lz(() => import("./pages/tier1to5/MerchantLending"));

// ── Tier 6-8 pages ────────────────────────────────────────────────────────────
const InsurancePremium = lz(() => import("./pages/tier6to8/InsurancePremium"));
const CarbonCredit = lz(() => import("./pages/tier6to8/CarbonCredit"));
const NFTBadges = lz(() => import("./pages/tier6to8/NFTBadges"));
const BNPLv2 = lz(() => import("./pages/tier6to8/BNPLv2"));
const CryptoRamp = lz(() => import("./pages/tier6to8/CryptoRamp"));
const EscrowService = lz(() => import("./pages/tier6to8/EscrowService"));
const BulkScheduler = lz(() => import("./pages/tier6to8/BulkScheduler"));
const TaxWithholding = lz(() => import("./pages/tier6to8/TaxWithholding"));
const RegulatorySandbox = lz(() => import("./pages/tier6to8/RegulatorySandbox"));
const MultiCurrencyWallet = lz(() => import("./pages/tier6to8/MultiCurrencyWallet"));
const RTGSDashboard = lz(() => import("./pages/tier6to8/RTGSDashboard"));
const ISO20022 = lz(() => import("./pages/tier6to8/ISO20022"));
const OpenFinanceHub = lz(() => import("./pages/tier6to8/OpenFinanceHub"));
const WhiteLabelSDK = lz(() => import("./pages/tier6to8/WhiteLabelSDK"));
const SuperApp = lz(() => import("./pages/tier6to8/SuperApp"));
const LakehouseV2 = lz(() => import("./pages/tier6to8/LakehouseV2"));
const PayrollV2 = lz(() => import("./pages/tier6to8/PayrollV2"));
const AgentNetwork = lz(() => import("./pages/tier6to8/AgentNetwork"));
const SDKPortal = lz(() => import("./pages/tier6to8/SDKPortal"));
const POSv2 = lz(() => import("./pages/tier6to8/POSv2"));
const RemittanceV2 = lz(() => import("./pages/tier6to8/RemittanceV2"));

// ── New Feature pages ─────────────────────────────────────────────────────────
const DigitalGold = lz(() => import("./pages/GatedDigitalGold"));
const MutualFunds = lz(() => import("./pages/MutualFunds"));
const ConsumerInsurance = lz(() => import("./pages/ConsumerInsurance"));
const PensionNPS = lz(() => import("./pages/PensionNPS"));
const CashbackRewards = lz(() => import("./pages/CashbackRewards"));
const VoicePayments = lz(() => import("./pages/VoicePayments"));
const WealthManagement = lz(() => import("./pages/GatedWealthManagement"));
const EMICheckout = lz(() => import("./pages/EMICheckout"));
const BulkCollections = lz(() => import("./pages/BulkCollections"));
const APIDocsPortal = lz(() => import("./pages/APIDocsPortal"));
const SalaryAccounts = lz(() => import("./pages/GatedSalaryAccounts"));
const PrivacyPayments = lz(() => import("./pages/PrivacyPayments"));
const ReportsCenter = lz(() => import("./pages/GatedReportsCenter"));
const AIInsightsV2 = lz(() => import("./pages/GatedAIInsightsV2"));
const NodalAccounts = lz(() => import("./pages/GatedNodalAccounts"));
const SmartRetailPOS = lz(() => import("./pages/SmartRetailPOS"));
const InternationalRemittance = lz(() => import("./pages/GatedInternationalRemittance"));
const SubscriptionBillingV2 = lz(() => import("./pages/GatedSubscriptionBillingV2"));

// ── Wave 80 pages ─────────────────────────────────────────────────────────────
const OpenBankingV2 = lz(() => import("./pages/wave80/OpenBankingV2"));
const CarbonCreditsV2 = lz(() => import("./pages/wave80/CarbonCreditsV2"));
const AgentBankingV4 = lz(() => import("./pages/wave80/AgentBankingV4"));
const SuperAgentV2 = lz(() => import("./pages/wave80/SuperAgentV2"));
const EscrowV2 = lz(() => import("./pages/wave80/EscrowV2"));
const MarketplacePay = lz(() => import("./pages/wave80/MarketplacePay"));
const LoyaltyV3 = lz(() => import("./pages/wave80/LoyaltyV3"));
const CryptoOfframpV2 = lz(() => import("./pages/wave80/CryptoOfframpV2"));
const NfcPay = lz(() => import("./pages/wave80/NfcPay"));
const QrMerchantAnalytics = lz(() => import("./pages/wave80/QrMerchantAnalytics"));
const InvoiceFinancingV2 = lz(() => import("./pages/wave80/InvoiceFinancingV2"));
const PayrollV3 = lz(() => import("./pages/wave80/PayrollV3"));
const TaxFiling = lz(() => import("./pages/wave80/TaxFiling"));
const RegulatoryReporting = lz(() => import("./pages/wave80/RegulatoryReporting"));
const UsdcV2 = lz(() => import("./pages/wave80/UsdcV2"));
const MultiCurrencyLedger = lz(() => import("./pages/wave80/MultiCurrencyLedger"));
const TemporalWorkflowMgmt = lz(() => import("./pages/wave80/TemporalWorkflowMgmt"));
const GrpcHealthCheck = lz(() => import("./pages/wave80/GrpcHealthCheck"));
const UssdSessionV2 = lz(() => import("./pages/wave80/UssdSessionV2"));
const RealtimeNotifications = lz(() => import("./pages/wave80/RealtimeNotifications"));

// ── Wave 84 pages ─────────────────────────────────────────────────────────────
const QRGenerator = lz(() => import("./pages/QRGenerator"));
const USSDSessions = lz(() => import("./pages/USSDSessions"));
const DeveloperSandbox = lz(() => import("./pages/DeveloperSandbox"));
const KYBVerification = lz(() => import("./pages/KYBVerification"));
const ComplianceReports = lz(() => import("./pages/ComplianceReports"));
const SDKTokens = lz(() => import("./pages/SDKTokens"));
const MerchantGuide = lz(() => import("./pages/docs/MerchantGuide"));
const ConsumerGuide = lz(() => import("./pages/docs/ConsumerGuide"));

// ── Admin pages ───────────────────────────────────────────────────────────────
const SupportAdmin = lz(() => import("./pages/SupportAdmin"));
const LakehouseAIDashboard = lz(() => import("./pages/LakehouseAIDashboard"));
const AdminPlatformOverview = lz(() => import("./pages/admin/AdminPlatformOverview"));
const AdminMerchantManagement = lz(() => import("./pages/admin/AdminMerchantManagement"));
const AdminKYCReview = lz(() => import("./pages/admin/AdminKYCReview"));
const AdminDisputeManagement = lz(() => import("./pages/admin/AdminDisputeManagement"));
const AdminFraudOversight = lz(() => import("./pages/admin/AdminFraudOversight"));
const AdminRevenue = lz(() => import("./pages/admin/AdminRevenue"));
const AdminSettlements = lz(() => import("./pages/admin/AdminSettlements"));
const AdminCompliance = lz(() => import("./pages/admin/AdminCompliance"));
const AdminSystemHealth = lz(() => import("./pages/admin/AdminSystemHealth"));
const AdminAuditTrail = lz(() => import("./pages/admin/AdminAuditTrail"));
const AdminNotifications = lz(() => import("./pages/admin/AdminNotifications"));
const AdminNotificationPreferences = lz(() => import("./pages/admin/AdminNotificationPreferences"));
const AdminWebhookAlerts = lz(() => import("./pages/admin/AdminWebhookAlerts"));
const AdminConfig = lz(() => import("./pages/admin/AdminConfig"));
const AdminFeatureFlags = lz(() => import("./pages/admin/AdminFeatureFlags"));
const AdminMerchantRisk = lz(() => import("./pages/admin/AdminMerchantRisk"));
const AdminChargebacks = lz(() => import("./pages/admin/AdminChargebacks"));
const AdminHelpAnalytics = lz(() => import("./pages/admin/AdminHelpAnalytics"));
const AdminAuditLog = lz(() => import("./pages/admin/AdminAuditLog"));
const AdminApiPlayground = lz(() => import("./pages/admin/AdminApiPlayground"));
const AdminRateLimitDashboard = lz(() => import("./pages/admin/AdminRateLimitDashboard"));
const AdminSdkTokens = lz(() => import("./pages/admin/AdminSdkTokens"));
const AdminTenantManagement = lz(() => import("./pages/admin/AdminTenantManagement"));
const AdminWhiteLabel = lz(() => import("./pages/admin/AdminWhiteLabel"));
const AdminKybReview = lz(() => import("./pages/admin/AdminKybReview"));
const AdminFxHedging = lz(() => import("./pages/admin/AdminFxHedging"));
const AdminPayoutApproval = lz(() => import("./pages/admin/AdminPayoutApproval"));
const AdminComplianceReports = lz(() => import("./pages/admin/AdminComplianceReports"));
const AdminSecurityScore = lz(() => import("./pages/admin/AdminSecurityScore"));
const AdminWebhookRetry = lz(() => import("./pages/admin/AdminWebhookRetry"));
const AdminGNNTraining = lz(() => import("./pages/admin/AdminGNNTraining"));
const AdminKeycloak = lz(() => import("./pages/admin/AdminKeycloak"));
const AdminSettlementSLA = lz(() => import("./pages/admin/AdminSettlementSLA"));
const AdminDisputeLifecycle = lz(() => import("./pages/admin/AdminDisputeLifecycle"));
const AdminDataPipeline = lz(() => import("./pages/admin/AdminDataPipeline"));
const AdminBnplUnderwriting = lz(() => import("./pages/admin/AdminBnplUnderwriting"));
const AdminLoyaltyTierEngine = lz(() => import("./pages/admin/AdminLoyaltyTierEngine"));
const AdminInviteCodes = lz(() => import("./pages/admin/AdminInviteCodes"));
const AdminRevenueAnalytics = lz(() => import("./pages/admin/AdminRevenueAnalytics"));
const AdminSlaMonitoring = lz(() => import("./pages/admin/AdminSlaMonitoring"));
const AdminChargebackManagement = lz(() => import("./pages/admin/AdminChargebackManagement"));
const AdminInviteCodesPage = lz(() => import("./pages/admin/AdminInviteCodesPage"));
const PartnerOnboardingPage = lz(() => import("./pages/admin/PartnerOnboardingPage"));
const TenantCorridorsPage = lz(() => import("./pages/admin/TenantCorridorsPage"));
const PlanLimitsPage = lz(() => import("./pages/admin/PlanLimitsPage"));
const BillingInvoicesPage = lz(() => import("./pages/admin/BillingInvoicesPage"));
const SSOConfigPage = lz(() => import("./pages/admin/SSOConfigPage"));
const FraudRingDashboard = lz(() => import("./pages/admin/FraudRingDashboard"));
const GNNThresholdPage = lz(() => import("./pages/admin/GNNThresholdPage"));
const KybStateMachine = lz(() => import("./pages/admin/KybStateMachine"));
const MiddlewareIntegrations = lz(() => import("./pages/admin/MiddlewareIntegrations"));
const MiddlewareHealthAlerts = lz(() => import("./pages/admin/MiddlewareHealthAlerts"));
const PayoutApprovalWorkflow = lz(() => import("./pages/admin/PayoutApprovalWorkflow"));
const BnplDelinquencyManagement = lz(() => import("./pages/admin/BnplDelinquencyManagement"));
const DisputeSlaTracking = lz(() => import("./pages/admin/DisputeSlaTracking"));

// ── Misc pages ────────────────────────────────────────────────────────────────
const PartnerOnboard = lz(() => import("./pages/PartnerOnboard"));
const PartnerOnboardingWizard = lz(() => import("./pages/partner/PartnerOnboarding"));
const TenantAdminDashboard = lz(() => import("./pages/TenantAdminDashboard"));
const WhiteLabelPreview = lz(() => import("./pages/WhiteLabelPreview"));
const TenantBillingDashboard = lz(() => import("./pages/TenantBillingDashboard"));
const CorridorManagement = lz(() => import("./pages/CorridorManagement"));
const TenantSsoConfig = lz(() => import("./pages/TenantSsoConfig"));
const TenantApiKeys = lz(() => import("./pages/TenantApiKeys"));
const RateLimitDashboard = lz(() => import("./pages/RateLimitDashboard"));
const LoyaltyAutoPromotion = lz(() => import("./pages/LoyaltyAutoPromotion"));
const BnplRepaymentTracker = lz(() => import("./pages/BnplRepaymentTracker"));
const DisputeEscalation = lz(() => import("./pages/DisputeEscalation"));
const TenantStripeBilling = lz(() => import("./pages/TenantStripeBilling"));
const OnboardingEmailFlow = lz(() => import("./pages/OnboardingEmailFlow"));
const SlaAlertDashboard = lz(() => import("./pages/SlaAlertDashboard"));
const FxHedgingWorkflow = lz(() => import("./pages/FxHedgingWorkflow"));
const TenantBillingCron = lz(() => import("./pages/TenantBillingCron"));
const UssdMenuBuilder = lz(() => import("./pages/UssdMenuBuilder"));
const BNPLRepaymentPage = lz(() => import("./pages/BNPLRepaymentPage"));
const SubscriptionsPage = lz(() => import("./pages/SubscriptionsPage"));
const PricingPage = lz(() => import("./pages/PricingPage"));
const WebhookEventsPage = lz(() => import("./pages/WebhookEventsPage"));
const EMILoansPage = lz(() => import("./pages/EMILoansPage"));
const InsurancePage = lz(() => import("./pages/InsurancePage"));

// ── Consumer pages ────────────────────────────────────────────────────────────
const ConsumerWallet = lz(() => import("./pages/consumer/ConsumerWallet"));
const MakePayment = lz(() => import("./pages/consumer/MakePayment"));
const BillPay = lz(() => import("./pages/consumer/BillPay"));
const ConsumerProfile = lz(() => import("./pages/consumer/ConsumerProfile"));
const ConsumerHistory = lz(() => import("./pages/consumer/History"));
const ConsumerQuickPay = lz(() => import("./pages/consumer/ConsumerQuickPay"));
const ConsumerNotifications = lz(() => import("./pages/consumer/ConsumerNotifications"));
const ConsumerNotificationSettings = lz(() => import("./pages/consumer/ConsumerNotificationSettings"));
const ConsumerOnboarding = lz(() => import("./pages/consumer/ConsumerOnboarding"));
const RedEnvelope = lz(() => import("./pages/consumer/RedEnvelope"));
const QRScanPay = lz(() => import("./pages/consumer/QRScanPay"));
const RequestMoney = lz(() => import("./pages/consumer/RequestMoney"));
const Contacts = lz(() => import("./pages/consumer/Contacts"));
const Loyalty = lz(() => import("./pages/consumer/Loyalty"));
const Coupons = lz(() => import("./pages/consumer/Coupons"));
const ConsumerCard = lz(() => import("./pages/consumer/ConsumerCard"));
const RecurringPayments = lz(() => import("./pages/consumer/RecurringPayments"));
const SplitBill = lz(() => import("./pages/consumer/SplitBill"));
const PINSetup = lz(() => import("./pages/consumer/PINSetup"));
const ConsumerKYC = lz(() => import("./pages/consumer/ConsumerKYC"));
const Discover = lz(() => import("./pages/consumer/Discover"));
const ConsumerCrossBorder = lz(() => import("./pages/consumer/ConsumerCrossBorder"));
const NotificationCentre = lz(() => import("./pages/consumer/NotificationCentre"));
const WalletStatement = lz(() => import("./pages/consumer/WalletStatement"));
const ConsumerBudgets = lz(() => import("./pages/consumer/ConsumerBudgets"));
const ConsumerSavingsGoals = lz(() => import("./pages/consumer/ConsumerSavingsGoals"));
const ConsumerReferrals = lz(() => import("./pages/consumer/ConsumerReferrals"));
const ConsumerHelpSearch = lz(() => import("./pages/consumer/ConsumerHelpSearch"));
const ConsumerDisputeFiling = lz(() => import("./pages/consumer/ConsumerDisputeFiling"));
const ConsumerFinancialHub = lz(() => import("./pages/consumer/ConsumerFinancialHub"));
const ConsumerGold = lz(() => import("./pages/consumer/ConsumerGold"));
const ConsumerMutualFunds = lz(() => import("./pages/consumer/ConsumerMutualFunds"));
const ConsumerPension = lz(() => import("./pages/consumer/ConsumerPension"));
const ConsumerEMI = lz(() => import("./pages/consumer/ConsumerEMI"));
const ConsumerRemittance = lz(() => import("./pages/consumer/ConsumerRemittance"));
const ConsumerInsuranceV2 = lz(() => import("./pages/consumer/ConsumerInsuranceV2"));
const ConsumerInsurancePortal = lz(() => import("./pages/consumer/ConsumerInsurancePortal"));
const ConsumerSubscriptions = lz(() => import("./pages/consumer/ConsumerSubscriptions"));
const ConsumerSIPScheduler = lz(() => import("./pages/consumer/ConsumerSIPScheduler"));
const PortfolioSummary = lz(() => import("./pages/consumer/PortfolioSummary"));
const PortfolioRebalancing = lz(() => import("./pages/consumer/PortfolioRebalancing"));
const ClaimsTracker = lz(() => import("./pages/consumer/ClaimsTracker"));
const ConsumerLoyaltyDashboard = lz(() => import("./pages/consumer/ConsumerLoyaltyDashboard"));
const ConsumerBnplRepayments = lz(() => import("./pages/consumer/ConsumerBnplRepayments"));
const AdminTenantBilling = lz(() => import("./pages/admin/AdminTenantBilling"));
const AdminCorridorMonitor = lz(() => import("./pages/admin/AdminCorridorMonitor"));
const AdminSlaMonitorPage = lz(() => import("./pages/admin/AdminSlaMonitor"));
const AdminTenantRevenuePage = lz(() => import("./pages/admin/AdminTenantRevenue"));
const WhiteLabelSDKPage = lz(() => import("./pages/WhiteLabelSDK"));

// ── Orphaned Tables CRUD pages ──────────────────────────────────────────────
const LoyaltyLedger = lz(() => import("./pages/LoyaltyLedger"));
const CarbonCreditsLedger = lz(() => import("./pages/CarbonCreditsLedger"));
const EscrowContractsPage = lz(() => import("./pages/EscrowContracts"));
const BillingConfigPage = lz(() => import("./pages/BillingConfig"));
const BillingAnalyticsPage = lz(() => import("./pages/BillingAnalytics"));

// ── Wave 120 new pages ──────────────────────────────────────────────────────
const StaffManagementPage = lz(() => import("./pages/StaffManagement"));
const InsuranceClaimsPage = lz(() => import("./pages/InsuranceClaims"));
const SupportChatPage = lz(() => import("./pages/SupportChat"));
const UsdcV3Page = lz(() => import("./pages/UsdcV3"));
const WebhookSimulatorV2Page = lz(() => import("./pages/WebhookSimulatorV2"));
const TaxFilingV2Page = lz(() => import("./pages/TaxFilingV2"));
const TransactionReceiptsV2Page = lz(() => import("./pages/TransactionReceiptsV2"));
const SplitBillV2Page = lz(() => import("./pages/SplitBillV2"));

// ── Wave 121 new pages ──────────────────────────────────────────────────────
const FeeSchedulesPage = lz(() => import("./pages/FeeSchedules"));
const ChargebackCasesPage = lz(() => import("./pages/ChargebackCases"));
const FraudRulesPage = lz(() => import("./pages/FraudRules"));
const KYBVerificationsPage = lz(() => import("./pages/KYBVerifications"));
const InvoiceFinancingPage = lz(() => import("./pages/InvoiceFinancing"));
const LoyaltyV3Page = lz(() => import("./pages/LoyaltyV3"));
const TenantProvisioningPage = lz(() => import("./pages/TenantProvisioning"));
const AuditLogViewerPage = lz(() => import("./pages/AuditLogViewer"));

// ── Wave 122 new pages ──────────────────────────────────────────────────────
const FraudRuleEnginePage = lz(() => import("./pages/FraudRuleEngine"));
const KYBDocumentUploadPage = lz(() => import("./pages/KYBDocumentUpload"));
const LoyaltyRedemptionPage = lz(() => import("./pages/LoyaltyRedemption"));
// Wave 123
const AIModelAdminPage = lz(() => import("./pages/AIModelAdmin"));
const MenuManagementPage = lz(() => import("./pages/MenuManagement"));
const PortalHealthDashboardPage = lz(() => import("./pages/PortalHealthDashboard"));
// Wave 124
const BillPaymentsPage = lz(() => import("./pages/BillPayments"));
const CarbonCreditsPage = lz(() => import("./pages/CarbonCredits"));

// ── Page loading fallback ─────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/" || location === "/login" || location === "/onboarding";
  const isConsumerPage = location.startsWith("/consumer");
  const isOrderPage = location.startsWith("/order/");

  if (isOrderPage) {
    const slug = location.replace("/order/", "");
    return (
      <Suspense fallback={<PageLoader />}>
        <PublicOrderPageLazy slug={slug} />
      </Suspense>
    );
  }

  if (isAuthPage) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Login} />
          <Route path="/login" component={Login} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/invite/accept" component={AcceptInvite} />
          <Route path="/admin/support"><AdminGuard><SupportAdmin /></AdminGuard></Route>
          <Route path="/admin/gnn-training" component={AdminGNNTraining} />
          <Route path="/admin/keycloak" component={AdminKeycloak} />
          <Route path="/admin/settlement-sla" component={AdminSettlementSLA} />
          <Route path="/admin/dispute-lifecycle" component={AdminDisputeLifecycle} />
          <Route path="/admin/data-pipeline" component={AdminDataPipeline} />
          <Route path="/admin/ai"><AdminGuard><LakehouseAIDashboard /></AdminGuard></Route>
        </Switch>
      </Suspense>
    );
  }

  if (isConsumerPage) {
    return (
      <ConsumerLayout>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/consumer" component={ConsumerWallet} />
            <Route path="/consumer/send" component={MakePayment} />
            <Route path="/consumer/qr" component={QRPayments} />
            <Route path="/consumer/bills" component={BillPay} />
            <Route path="/consumer/profile" component={ConsumerProfile} />
            <Route path="/consumer/history" component={ConsumerHistory} />
            <Route path="/consumer/quick-pay" component={ConsumerQuickPay} />
            <Route path="/consumer/notifications" component={ConsumerNotifications} />
            <Route path="/consumer/notifications/settings" component={ConsumerNotificationSettings} />
            <Route path="/consumer/onboarding" component={ConsumerOnboarding} />
            <Route path="/consumer/red-envelope/:id" component={RedEnvelope} />
            <Route path="/consumer/red-envelope" component={RedEnvelope} />
            <Route path="/consumer/qr-scan" component={QRScanPay} />
            <Route path="/consumer/request-money" component={RequestMoney} />
            <Route path="/consumer/contacts" component={Contacts} />
            <Route path="/consumer/loyalty" component={Loyalty} />
            <Route path="/consumer/coupons" component={Coupons} />
            <Route path="/consumer/card" component={ConsumerCard} />
            <Route path="/consumer/recurring" component={RecurringPayments} />
            <Route path="/consumer/split-bill" component={SplitBill} />
            <Route path="/consumer/pin" component={PINSetup} />
            <Route path="/consumer/kyc" component={ConsumerKYC} />
            <Route path="/consumer/discover" component={Discover} />
            <Route path="/consumer/cross-border" component={ConsumerCrossBorder} />
            <Route path="/consumer/analytics" component={ConsumerAnalytics} />
            <Route path="/consumer/disputes" component={ConsumerDisputes} />
            <Route path="/consumer/notification-centre" component={NotificationCentre} />
            <Route path="/consumer/statement" component={WalletStatement} />
            <Route path="/consumer/help" component={ConsumerGuide} />
            <Route path="/consumer/budgets" component={ConsumerBudgets} />
            <Route path="/consumer/savings" component={ConsumerSavingsGoals} />
            <Route path="/consumer/referrals" component={ConsumerReferrals} />
            <Route path="/consumer/help-search" component={ConsumerHelpSearch} />
            <Route path="/consumer/dispute-filing" component={ConsumerDisputeFiling} />
            <Route path="/consumer/financial" component={ConsumerFinancialHub} />
            <Route path="/consumer/gold" component={ConsumerGold} />
            <Route path="/consumer/mutual-funds" component={ConsumerMutualFunds} />
            <Route path="/consumer/pension" component={ConsumerPension} />
            <Route path="/consumer/emi" component={ConsumerEMI} />
            <Route path="/consumer/remittance" component={ConsumerRemittance} />
            <Route path="/consumer/insurance" component={ConsumerInsuranceV2} />
            <Route path="/consumer/insurance-portal" component={ConsumerInsurancePortal} />
            <Route path="/consumer/subscriptions" component={ConsumerSubscriptions} />
            <Route path="/consumer/sip" component={ConsumerSIPScheduler} />
            <Route path="/consumer/portfolio" component={PortfolioSummary} />
            <Route path="/consumer/portfolio/rebalance" component={PortfolioRebalancing} />
            <Route path="/consumer/claims" component={ClaimsTracker} />
            <Route path="/consumer/loyalty-dashboard" component={ConsumerLoyaltyDashboard} />
            <Route path="/consumer/bnpl-repayments" component={ConsumerBnplRepayments} />
            <Route component={ConsumerWallet} />
          </Switch>
        </Suspense>
      </ConsumerLayout>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/docs/merchant-guide" component={MerchantGuide} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/customers" component={Customers} />
          <Route path="/virtual-cards" component={VirtualCards} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/merchant-analytics" component={MerchantAnalyticsDashboard} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/payouts" component={Payouts} />
          <Route path="/usdc-payouts" component={USDCPayouts} />
          <Route path="/disputes" component={Disputes} />
          <Route path="/disputes/:id" component={DisputeWorkflow} />
          <Route path="/payment-links" component={PaymentLinks} />
          <Route path="/fraud-risk" component={FraudRisk} />
        <Route path="/fraud/alerts" component={FraudAlertsDashboard} />
            <Route path="/infra/waf-alerts" component={WAFAlertDashboard} />
            <Route path="/bnpl/calculator" component={BNPLCalculator} />
            <Route path="/insurance/hub" component={InsuranceHub} />
            <Route path="/remittance/tracker" component={RemittanceTracker} />
          <Route path="/reconciliation-alerts" component={ReconciliationAlerts} />
          <Route path="/bnpl" component={BNPL} />
          <Route path="/fx" component={FXDashboard} />
          <Route path="/team" component={TeamRoles} />
          <Route path="/mobile-money" component={MobileMoneyRecon} />
          <Route path="/compliance" component={ComplianceKYC} />
          <Route path="/compliance/settings" component={ComplianceSettings} />
          <Route path="/api-keys" component={APIKeys} />
          <Route path="/webhooks" component={Webhooks} />
        <Route path={"/webhooks/simulator"} component={WebhookSimulator} />
          <Route path="/webhooks/deliveries" component={WebhookDeliveries} />
          <Route path="/settings" component={Settings} />
          <Route path="/qr-payments" component={QRPayments} />
          <Route path="/cross-border" component={CrossBorder} />
          <Route path="/mojaloop" component={MojaloopDashboard} />
          <Route path="/developer" component={DeveloperPortal} />
          <Route path="/workflows" component={WorkflowObservability} />
          <Route path="/role-sync" component={KeycloakRoleSync} />
          <Route path="/nip-banks" component={NIPBanks} />
          <Route path="/subscriptions" component={Subscriptions} />
          <Route path="/pos-terminals" component={POSTerminals} />
          <Route path="/terminal-map" component={TerminalMap} />
          <Route path="/pos-reconciliation" component={POSReconciliation} />
          <Route path="/ptsp-settlement" component={PTSPSettlement} />
          <Route path="/ptsp-batches" component={PtspBatches} />
          <Route path="/agent-banking" component={AgentBanking} />
          <Route path="/kiosk-health" component={KioskHealth} />
          <Route path="/restaurant/floor-plan" component={RestaurantFloorPlan} />
          <Route path="/restaurant/orders" component={RestaurantOrders} />
          <Route path="/restaurant/menu" component={RestaurantMenu} />
          <Route path="/restaurant/loyalty" component={RestaurantLoyalty} />
          <Route path="/restaurant/online-ordering" component={RestaurantOnlineOrdering} />
          <Route path="/kitchen-display" component={KitchenDisplay} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/payroll" component={Payroll} />
          <Route path="/geofence-alerts" component={GeofenceAlerts} />
          <Route path="/microservice-health" component={MicroserviceHealth} />
          <Route path="/admin-setup" component={AdminSetup} />
          <Route path="/admin" component={AdminPlatformOverview} />
          <Route path="/admin/merchants" component={AdminMerchantManagement} />
          <Route path="/admin/kyc" component={AdminKYCReview} />
          <Route path="/admin/disputes" component={AdminDisputeManagement} />
          <Route path="/admin/fraud" component={AdminFraudOversight} />
          <Route path="/admin/revenue" component={AdminRevenue} />
          <Route path="/admin/settlements" component={AdminSettlements} />
          <Route path="/admin/compliance" component={AdminCompliance} />
          <Route path="/admin/health" component={AdminSystemHealth} />
          <Route path="/admin/audit" component={AdminAuditTrail} />
          <Route path="/admin/notifications" component={AdminNotifications} />
          <Route path="/admin/notifications/preferences" component={AdminNotificationPreferences} />
          <Route path="/admin/webhook-alerts" component={AdminWebhookAlerts} />
          <Route path="/admin/config" component={AdminConfig} />
          <Route path="/admin/feature-flags" component={AdminFeatureFlags} />
          <Route path="/admin/merchant-risk" component={AdminMerchantRisk} />
          <Route path="/admin/chargebacks" component={AdminChargebacks} />
          <Route path="/admin/help-analytics" component={AdminHelpAnalytics} />
          <Route path="/admin/audit-log" component={AdminAuditLog} />
          <Route path="/admin/api-playground" component={AdminApiPlayground} />
          <Route path="/admin/rate-limits" component={AdminRateLimitDashboard} />
          <Route path="/admin/sdk-tokens" component={AdminSdkTokens} />
          <Route path="/admin/tenants" component={AdminTenantManagement} />
          <Route path="/admin/white-label" component={AdminWhiteLabel} />
          <Route path="/admin/kyb-review" component={AdminKybReview} />
          <Route path="/admin/fx-hedging" component={AdminFxHedging} />
          <Route path="/admin/payout-approval" component={AdminPayoutApproval} />
          <Route path="/admin/compliance-reports" component={AdminComplianceReports} />
          <Route path="/admin/security-score" component={AdminSecurityScore} />
          <Route path="/admin/webhook-retry" component={AdminWebhookRetry} />
          <Route path="/admin/data-pipeline"><AdminGuard><AdminDataPipeline /></AdminGuard></Route>
          <Route path="/admin/bnpl-underwriting" component={AdminBnplUnderwriting} />
          <Route path="/admin/loyalty-tiers" component={AdminLoyaltyTierEngine} />
          <Route path="/admin/invite-codes" component={AdminInviteCodes} />
          <Route path="/admin/tenant-billing" component={AdminTenantBilling} />
          <Route path="/admin/corridors" component={AdminCorridorMonitor} />
          <Route path="/admin/sla-monitor" component={AdminSlaMonitorPage} />
          <Route path="/admin/tenant-revenue" component={AdminTenantRevenuePage} />
          <Route path="/sdk" component={WhiteLabelSDKPage} />
          <Route path="/partner/onboard" component={PartnerOnboard} />
          <Route path="/partner/onboard/wizard" component={PartnerOnboardingWizard} />
          <Route path="/admin/tenant" component={TenantAdminDashboard} />
          <Route path="/partner/preview" component={WhiteLabelPreview} />
          <Route path="/ollama-chat" component={OllamaChat} />
          <Route path="/go-live" component={GoLiveChecklist} />
          <Route path="/go-live-checklist" component={GoLiveChecklist} />
          <Route path="/settings/payments" component={SettingsPayments} />
          <Route path="/quick-pay" component={QuickPay} />
          <Route path="/notifications" component={NotificationsCenter} />
          <Route path="/notifications/preferences" component={MerchantNotificationPreferences} />
          <Route path="/audit-log" component={AuditLog} />
          <Route path="/purchase-orders" component={PurchaseOrders} />
          <Route path="/vendors" component={Vendors} />
          <Route path="/refunds" component={RefundWorkflow} />
          <Route path="/payout-batching" component={PayoutBatching} />
          <Route path="/receipt/:txId" component={TransactionReceipt} />
          <Route path="/settlements" component={Settlements} />
          <Route path="/lending" component={MerchantLending} />
          <Route path="/merchant-lending" component={MerchantLending} />
          <Route path="/split-payments" component={SplitPayments} />
          <Route path="/recurring-billing" component={RecurringBilling} />
          <Route path="/dcc" component={DCCDashboard} />
          <Route path="/dcc-checkout" component={DCCDashboard} />
          <Route path="/reconciliation" component={ReconciliationEngine} />
          <Route path="/invoice-builder" component={InvoiceBuilder} />
          <Route path="/chargeback-automation" component={ChargebackAutomation} />
          <Route path="/aml-monitor" component={AMLMonitor} />
          <Route path="/kyb-workflow" component={KYBWorkflow} />
          <Route path="/session-risk" component={SessionRisk} />
          <Route path="/open-banking" component={OpenBanking} />
          <Route path="/loyalty-engine" component={LoyaltyEngine} />
          <Route path="/embedded-finance" component={EmbeddedFinance} />
          <Route path="/ai-insights" component={AIInsights} />
          <Route path="/fraud-heatmap" component={FraudHeatmap} />
          <Route path="/insurance-premium" component={InsurancePremium} />
          <Route path="/carbon-credit" component={CarbonCredit} />
          <Route path="/nft-badges" component={NFTBadges} />
          <Route path="/bnpl-v2" component={BNPLv2} />
          <Route path="/crypto-ramp" component={CryptoRamp} />
          <Route path="/escrow" component={EscrowService} />
          <Route path="/bulk-scheduler" component={BulkScheduler} />
          <Route path="/tax-withholding" component={TaxWithholding} />
          <Route path="/regulatory-sandbox" component={RegulatorySandbox} />
          <Route path="/multi-currency-wallet" component={MultiCurrencyWallet} />
          <Route path="/rtgs" component={RTGSDashboard} />
          <Route path="/iso20022" component={ISO20022} />
          <Route path="/open-finance" component={OpenFinanceHub} />
          <Route path="/white-label-sdk" component={WhiteLabelSDK} />
          <Route path="/super-app" component={SuperApp} />
          <Route path="/lakehouse-v2" component={LakehouseV2} />
          <Route path="/payroll-v2" component={PayrollV2} />
          <Route path="/settlement-forecast" component={SettlementForecast} />
          <Route path="/tax-engine" component={TaxEngine} />
          <Route path="/agent-network" component={AgentNetwork} />
          <Route path="/sdk-portal" component={SDKPortal} />
          <Route path="/cohort-analytics" component={CohortAnalytics} />
          <Route path="/pos-v2" component={POSv2} />
          <Route path="/remittance-v2" component={RemittanceV2} />
          <Route path="/remittance" component={RemittanceV2} />
          <Route path="/dispute-automation" component={DisputeAutomation} />
          <Route path="/open-banking-portal" component={OpenBankingPortal} />
          <Route path="/merchant-lending-v2" component={MerchantLendingV2} />
          <Route path="/mobile-pos" component={MobilePOS} />
          <Route path="/digital-gold" component={DigitalGold} />
          <Route path="/mutual-funds" component={MutualFunds} />
          <Route path="/consumer-insurance" component={ConsumerInsurance} />
          <Route path="/pension-nps" component={PensionNPS} />
          <Route path="/cashback-rewards" component={CashbackRewards} />
          <Route path="/voice-payments" component={VoicePayments} />
          <Route path="/wealth-management" component={WealthManagement} />
          <Route path="/emi-checkout" component={EMICheckout} />
          <Route path="/bulk-collections" component={BulkCollections} />
          <Route path="/api-docs" component={APIDocsPortal} />
          <Route path="/salary-accounts" component={SalaryAccounts} />
          <Route path="/privacy-payments" component={PrivacyPayments} />
          <Route path="/reports-center" component={ReportsCenter} />
          <Route path="/reports" component={ReportsCenter} />
          <Route path="/ai-insights-v2" component={AIInsightsV2} />
          <Route path="/nodal-accounts" component={NodalAccounts} />
          <Route path="/smart-pos" component={SmartRetailPOS} />
          <Route path="/intl-remittance" component={InternationalRemittance} />
          <Route path="/subscription-billing-v2" component={SubscriptionBillingV2} />
          <Route path="/billing" component={Billing} />
          <Route path="/open-banking-v2" component={OpenBankingV2} />
          <Route path="/carbon-credits-v2" component={CarbonCreditsV2} />
          <Route path="/agent-banking-v4" component={AgentBankingV4} />
          <Route path="/super-agent-v2" component={SuperAgentV2} />
          <Route path="/escrow-v2" component={EscrowV2} />
          <Route path="/loyalty-ledger" component={LoyaltyLedger} />
          <Route path="/carbon-credits-ledger" component={CarbonCreditsLedger} />
          <Route path="/escrow-contracts" component={EscrowContractsPage} />
          <Route path="/marketplace-pay" component={MarketplacePay} />
          <Route path="/loyalty-v3" component={LoyaltyV3} />
          <Route path="/crypto-offramp-v2" component={CryptoOfframpV2} />
          <Route path="/crypto-offramp" component={CryptoOfframpV2} />
          <Route path="/nfc-pay" component={NfcPay} />
          <Route path="/qr-analytics" component={QrMerchantAnalytics} />
          <Route path="/invoice-financing-v2" component={InvoiceFinancingV2} />
          <Route path="/payroll-v3" component={PayrollV3} />
          <Route path="/tax-filing" component={TaxFiling} />
          <Route path="/regulatory-reporting" component={RegulatoryReporting} />
          <Route path="/usdc-v2" component={UsdcV2} />
          <Route path="/multi-currency-ledger" component={MultiCurrencyLedger} />
          <Route path="/temporal-workflows" component={TemporalWorkflowMgmt} />
          <Route path="/grpc-health" component={GrpcHealthCheck} />
          <Route path="/ussd-v2" component={UssdSessionV2} />
          <Route path="/realtime-notifications" component={RealtimeNotifications} />
          <Route path="/qr-generator" component={QRGenerator} />
          <Route path="/ussd-sessions" component={USSDSessions} />
          <Route path="/developer-sandbox" component={DeveloperSandbox} />
          <Route path="/kyb-verification" component={KYBVerification} />
          <Route path="/compliance-reports" component={ComplianceReports} />
          <Route path="/sdk-tokens" component={SDKTokens} />
          <Route path="/tenant/billing" component={TenantBillingDashboard} />
          <Route path="/tenant/corridors" component={CorridorManagement} />
          <Route path="/tenant/sso" component={TenantSsoConfig} />
          <Route path="/tenant/api-keys" component={TenantApiKeys} />
          <Route path="/admin/rate-limit-dashboard" component={RateLimitDashboard} />
          <Route path="/loyalty/auto-promotion" component={LoyaltyAutoPromotion} />
          <Route path="/bnpl/repayment-tracker" component={BnplRepaymentTracker} />
          <Route path="/disputes/escalation" component={DisputeEscalation} />
          <Route path="/admin/revenue-analytics" component={AdminRevenueAnalytics} />
          <Route path="/admin/sla-monitoring" component={AdminSlaMonitoring} />
          <Route path="/admin/chargeback-management" component={AdminChargebackManagement} />
          <Route path="/tenant/stripe-billing" component={TenantStripeBilling} />
          <Route path="/admin/onboarding-emails" component={OnboardingEmailFlow} />
          <Route path="/admin/sla-alerts" component={SlaAlertDashboard} />
          <Route path="/admin/kyb-state-machine" component={KybStateMachine} />
          <Route path="/admin/middleware-integrations" component={MiddlewareIntegrations} />
          <Route path="/fx/hedging" component={FxHedgingWorkflow} />
          <Route path="/admin/billing-cron" component={TenantBillingCron} />
          <Route path="/admin/ussd-menu-builder" component={UssdMenuBuilder} />
          <Route path="/admin/middleware-health-alerts" component={MiddlewareHealthAlerts} />
          <Route path="/admin/payout-approval-workflow" component={PayoutApprovalWorkflow} />
          <Route path="/admin/bnpl-delinquency" component={BnplDelinquencyManagement} />
          <Route path="/admin/dispute-sla" component={DisputeSlaTracking} />
          <Route path="/admin/invite-codes-v2" component={AdminInviteCodesPage} />
          <Route path="/admin/partner-onboarding" component={PartnerOnboardingPage} />
          <Route path="/admin/corridors" component={TenantCorridorsPage} />
          <Route path="/admin/plan-limits" component={PlanLimitsPage} />
          <Route path="/admin/billing-invoices" component={BillingInvoicesPage} />
          <Route path="/billing-engine/analytics" component={BillingAnalyticsPage} />
          <Route path="/billing-engine" component={BillingConfigPage} />
          <Route path="/admin/sso-config" component={SSOConfigPage} />
          <Route path="/bnpl/repayment" component={BNPLRepaymentPage} />
          <Route path="/subscriptions-v2" component={SubscriptionsPage} />
          <Route path="/admin/fraud-rings" component={FraudRingDashboard} />
          <Route path="/admin/gnn-threshold" component={GNNThresholdPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/webhook-events" component={WebhookEventsPage} />
          <Route path="/emi-loans" component={EMILoansPage} />
          <Route path="/insurance" component={InsurancePage} />
          <Route path="/emi-management" component={EMIManagement} />
          <Route path="/subscription-management" component={SubscriptionManagement} />
          <Route path="/partner/admin" component={PartnerAdminDashboard} />
          <Route path="/tenant/branding" component={TenantBrandingAdmin} />
          <Route path="/partner/onboard/wizard" component={PartnerOnboardingWizard} />
          <Route path="/gold/sip" component={GoldSIP} />
          <Route path="/consumer/loyalty-app" component={ConsumerLoyaltyApp} />
          <Route path="/webhook-live" component={WebhookLiveStream} />
          <Route path="/admin/middleware-dashboard" component={MiddlewareDashboard} />
          <Route path="/staff-management" component={StaffManagementPage} />
          <Route path="/insurance-claims" component={InsuranceClaimsPage} />
          <Route path="/support-chat" component={SupportChatPage} />
          <Route path="/usdc-v3" component={UsdcV3Page} />
          <Route path="/webhook-simulator-v2" component={WebhookSimulatorV2Page} />
          <Route path="/tax-filing-v2" component={TaxFilingV2Page} />
          <Route path="/transaction-receipts" component={TransactionReceiptsV2Page} />
          <Route path="/split-bill-v2" component={SplitBillV2Page} />
          {/* Wave 121 routes */}
          <Route path="/fee-schedules" component={FeeSchedulesPage} />
          <Route path="/chargeback-cases" component={ChargebackCasesPage} />
          <Route path="/fraud-rules" component={FraudRulesPage} />
          <Route path="/kyb-verifications" component={KYBVerificationsPage} />
          <Route path="/invoice-financing" component={InvoiceFinancingPage} />
          <Route path="/loyalty-v3" component={LoyaltyV3Page} />
          <Route path="/admin/tenant-provisioning" component={TenantProvisioningPage} />
          <Route path="/audit-log" component={AuditLogViewerPage} />
          {/* Wave 122 routes */}
          <Route path="/fraud-rule-engine" component={FraudRuleEnginePage} />
          <Route path="/kyb-document-upload" component={KYBDocumentUploadPage} />
          <Route path="/loyalty-redemption" component={LoyaltyRedemptionPage} />
          {/* Wave 123 */}
          <Route path="/ai-model-admin" component={AIModelAdminPage} />
          <Route path="/menu-management" component={MenuManagementPage} />
          <Route path="/portal-health" component={PortalHealthDashboardPage} />
          {/* Wave 124 */}
          <Route path="/bill-payments" component={BillPaymentsPage} />
          <Route path="/carbon-credits" component={CarbonCreditsPage} />
          <Route component={Dashboard} />
    </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
          <OfflineIndicator />
          <PWAInstallBanner />
          <PWAUpdateToast />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
