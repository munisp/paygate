/**
 * PayGate Merchant Portal — React Native App Navigator
 * Stack + Tab navigation with auth gating.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, StyleSheet } from "react-native";

// Screens
import LoginScreen from "../screens/LoginScreen";
import DashboardScreen from "../screens/DashboardScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import CustomersScreen from "../screens/CustomersScreen";
import PayoutsScreen from "../screens/PayoutsScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import APIKeysScreen from "../screens/APIKeysScreen";
import PayrollScreen from "../screens/PayrollScreen";
import TeamRolesScreen from "../screens/TeamRolesScreen";
import MobileMoneyReconScreen from "../screens/MobileMoneyReconScreen";
import FXDashboardScreen from "../screens/FXDashboardScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import BillPaymentsScreen from "../screens/BillPaymentsScreen";
import CarbonCreditsScreen from "../screens/CarbonCreditsScreen";
import SubscriptionsScreen from "../screens/SubscriptionsScreen";
import CouponsScreen from "../screens/CouponsScreen";
import WebhooksScreen from "../screens/WebhooksScreen";
import SettingsScreen from "../screens/SettingsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import DisputesScreen from "../screens/DisputesScreen";
import VirtualCardsScreen from "../screens/VirtualCardsScreen";
import BillingEngineScreen from "../screens/BillingEngineScreen";
import AdminOverviewScreen from "../screens/AdminOverviewScreen";
import AIHubScreen from "../screens/AIHubScreen";
import AuthScreen from "../screens/AuthScreen";
import BillingScreen from "../screens/BillingScreen";
import CryptoScreen from "../screens/CryptoScreen";
import EscrowScreen from "../screens/EscrowScreen";
import InsuranceScreen from "../screens/InsuranceScreen";
import KYBDocumentUploadScreen from "../screens/KYBDocumentUploadScreen";
import LoyaltyScreen from "../screens/LoyaltyScreen";
import MobileMoneyScreen from "../screens/MobileMoneyScreen";
import NIPScreen from "../screens/NIPScreen";
import POSScreen from "../screens/POSScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SIPScreen from "../screens/SIPScreen";
import TeamScreen from "../screens/TeamScreen";
import USSDScreen from "../screens/USSDScreen";
// Wave 159+ screen imports
import AIInsightsScreen from "../screens/AIInsightsScreen";
import AIInsightsV2Screen from "../screens/AIInsightsV2Screen";
import AIModelAdminScreen from "../screens/AIModelAdminScreen";
import AMLMonitorScreen from "../screens/AMLMonitorScreen";
import APIDocsPortalScreen from "../screens/APIDocsPortalScreen";
import ActiveSessionsScreen from "../screens/ActiveSessionsScreen";
import AdminAuditLogScreen from "../screens/AdminAuditLogScreen";
import AdminComplianceScreen from "../screens/AdminComplianceScreen";
import AdminFraudOversightScreen from "../screens/AdminFraudOversightScreen";
import AdminKYCReviewScreen from "../screens/AdminKYCReviewScreen";
import AdminMerchantManagementScreen from "../screens/AdminMerchantManagementScreen";
import AdminPayoutApprovalScreen from "../screens/AdminPayoutApprovalScreen";
import AdminPlatformOverviewScreen from "../screens/AdminPlatformOverviewScreen";
import AdminRevenueScreen from "../screens/AdminRevenueScreen";
import AgentBankingScreen from "../screens/AgentBankingScreen";
import AuditLogScreen from "../screens/AuditLogScreen";
import AuditLogViewerScreen from "../screens/AuditLogViewerScreen";
import AuthEventsScreen from "../screens/AuthEventsScreen";
import BNPLCalculatorScreen from "../screens/BNPLCalculatorScreen";
import BNPLRepaymentPageScreen from "../screens/BNPLRepaymentPageScreen";
import BNPLScreen from "../screens/BNPLScreen";
import BillingAnalyticsScreen from "../screens/BillingAnalyticsScreen";
import BillingConfigScreen from "../screens/BillingConfigScreen";
import BnplRepaymentTrackerScreen from "../screens/BnplRepaymentTrackerScreen";
import BulkCollectionsScreen from "../screens/BulkCollectionsScreen";
import CIPSGatewayScreen from "../screens/CIPSGatewayScreen";
import CarbonCreditsLedgerScreen from "../screens/CarbonCreditsLedgerScreen";
import CashbackRewardsScreen from "../screens/CashbackRewardsScreen";
import ChargebackCasesScreen from "../screens/ChargebackCasesScreen";
import ChargebacksScreen from "../screens/ChargebacksScreen";
import ClaimDocumentsScreen from "../screens/ClaimDocumentsScreen";
import ComplianceKYCScreen from "../screens/ComplianceKYCScreen";
import ComplianceReportsScreen from "../screens/ComplianceReportsScreen";
import ComplianceScreen from "../screens/ComplianceScreen";
import ComplianceSettingsScreen from "../screens/ComplianceSettingsScreen";
import ConsumerAnalyticsScreen from "../screens/ConsumerAnalyticsScreen";
import ConsumerDisputesScreen from "../screens/ConsumerDisputesScreen";
import ConsumerInsuranceScreen from "../screens/ConsumerInsuranceScreen";
import ConsumerLoansScreen from "../screens/ConsumerLoansScreen";
import ConsumerLoyaltyAppScreen from "../screens/ConsumerLoyaltyAppScreen";
import CorridorLiveStatsScreen from "../screens/CorridorLiveStatsScreen";
import CorridorManagementScreen from "../screens/CorridorManagementScreen";
import CouponManagementScreen from "../screens/CouponManagementScreen";
import CrossBorderRailMonitorScreen from "../screens/CrossBorderRailMonitorScreen";
import CrossBorderScreen from "../screens/CrossBorderScreen";
import CryptoWalletScreen from "../screens/CryptoWalletScreen";
import DataExportScreen from "../screens/DataExportScreen";
import DeveloperPortalScreen from "../screens/DeveloperPortalScreen";
import DeveloperSandboxScreen from "../screens/DeveloperSandboxScreen";
import DigitalGoldScreen from "../screens/DigitalGoldScreen";
import DisputeEscalationScreen from "../screens/DisputeEscalationScreen";
import DisputeWorkflowScreen from "../screens/DisputeWorkflowScreen";
import EMICheckoutScreen from "../screens/EMICheckoutScreen";
import EMILoansPageScreen from "../screens/EMILoansPageScreen";
import EMIManagementScreen from "../screens/EMIManagementScreen";
import EscrowAccountsScreen from "../screens/EscrowAccountsScreen";
import EscrowContractsScreen from "../screens/EscrowContractsScreen";
import FXScreen from "../screens/FXScreen";
import FeeSchedulesScreen from "../screens/FeeSchedulesScreen";
import FraudAlertCommentsScreen from "../screens/FraudAlertCommentsScreen";
import FraudAlertsDashboardScreen from "../screens/FraudAlertsDashboardScreen";
import FraudRiskScreen from "../screens/FraudRiskScreen";
import FraudRulesScreen from "../screens/FraudRulesScreen";
import FxHedgingWorkflowScreen from "../screens/FxHedgingWorkflowScreen";
import GeofenceAlertsScreen from "../screens/GeofenceAlertsScreen";
import GiftCardsScreen from "../screens/GiftCardsScreen";
import GoLiveChecklistScreen from "../screens/GoLiveChecklistScreen";
import GoldSIPScreen from "../screens/GoldSIPScreen";
import InsuranceClaimsScreen from "../screens/InsuranceClaimsScreen";
import InsuranceHubScreen from "../screens/InsuranceHubScreen";
import InsurancePageScreen from "../screens/InsurancePageScreen";
import InsurancePoliciesScreen from "../screens/InsurancePoliciesScreen";
import InternationalRemittanceScreen from "../screens/InternationalRemittanceScreen";
import InventoryScreen from "../screens/InventoryScreen";
import InvoiceFinancingScreen from "../screens/InvoiceFinancingScreen";
import InvoicesScreen from "../screens/InvoicesScreen";
import KYBVerificationsScreen from "../screens/KYBVerificationsScreen";
import KeycloakRoleSyncScreen from "../screens/KeycloakRoleSyncScreen";
import KioskHealthScreen from "../screens/KioskHealthScreen";
import KitchenDisplayScreen from "../screens/KitchenDisplayScreen";
import LakehouseAIDashboardScreen from "../screens/LakehouseAIDashboardScreen";
import LivenessCheckScreen from "../screens/LivenessCheckScreen";
import LoanRepaymentsScreen from "../screens/LoanRepaymentsScreen";
import LoyaltyAutoPromotionScreen from "../screens/LoyaltyAutoPromotionScreen";
import LoyaltyDashboardScreen from "../screens/LoyaltyDashboardScreen";
import LoyaltyLedgerScreen from "../screens/LoyaltyLedgerScreen";
import LoyaltyProgramScreen from "../screens/LoyaltyProgramScreen";
import LoyaltyV3Screen from "../screens/LoyaltyV3Screen";
import MarketDataDashboardScreen from "../screens/MarketDataDashboardScreen";
import MenuManagementScreen from "../screens/MenuManagementScreen";
import MerchantAnalyticsDashboardScreen from "../screens/MerchantAnalyticsDashboardScreen";
import MerchantLendingScreen from "../screens/MerchantLendingScreen";
import MerchantNotificationPreferencesScreen from "../screens/MerchantNotificationPreferencesScreen";
import MicroserviceHealthScreen from "../screens/MicroserviceHealthScreen";
import MiddlewareDashboardScreen from "../screens/MiddlewareDashboardScreen";
import MobilePOSScreen from "../screens/MobilePOSScreen";
import MojaloopDashboardScreen from "../screens/MojaloopDashboardScreen";
import MultiCurrencyScreen from "../screens/MultiCurrencyScreen";
import MutualFundsScreen from "../screens/MutualFundsScreen";
import NIPBanksScreen from "../screens/NIPBanksScreen";
import NIPTransfersScreen from "../screens/NIPTransfersScreen";
import NodalAccountsScreen from "../screens/NodalAccountsScreen";
import NotificationsCenterScreen from "../screens/NotificationsCenterScreen";
import OllamaChatScreen from "../screens/OllamaChatScreen";
import PIXGatewayScreen from "../screens/PIXGatewayScreen";
import POSReconciliationScreen from "../screens/POSReconciliationScreen";
import POSTerminalsScreen from "../screens/POSTerminalsScreen";
import POSTransactionsScreen from "../screens/POSTransactionsScreen";
import PTSPSettlementScreen from "../screens/PTSPSettlementScreen";
import PartnerAdminDashboardScreen from "../screens/PartnerAdminDashboardScreen";
import PartnerOnboardScreen from "../screens/PartnerOnboardScreen";
import PaymentLinksScreen from "../screens/PaymentLinksScreen";
import PayoutBatchingScreen from "../screens/PayoutBatchingScreen";
import PensionNPSScreen from "../screens/PensionNPSScreen";
import PortalHealthDashboardScreen from "../screens/PortalHealthDashboardScreen";
import PortfolioRebalancingScreen from "../screens/PortfolioRebalancingScreen";
import PricingPageScreen from "../screens/PricingPageScreen";
import PrivacyPaymentsScreen from "../screens/PrivacyPaymentsScreen";
import PtspBatchesScreen from "../screens/PtspBatchesScreen";
import PurchaseOrdersScreen from "../screens/PurchaseOrdersScreen";
import QRGeneratorScreen from "../screens/QRGeneratorScreen";
import QRPaymentsScreen from "../screens/QRPaymentsScreen";
import QuickPayScreen from "../screens/QuickPayScreen";
import RateLimitDashboardScreen from "../screens/RateLimitDashboardScreen";
import ReconciliationAlertsScreen from "../screens/ReconciliationAlertsScreen";
import ReconciliationScreen from "../screens/ReconciliationScreen";
import RedEnvelopesScreen from "../screens/RedEnvelopesScreen";
import ReferralProgramScreen from "../screens/ReferralProgramScreen";
import ReferralsScreen from "../screens/ReferralsScreen";
import RefundWorkflowScreen from "../screens/RefundWorkflowScreen";
import RemittanceTrackerScreen from "../screens/RemittanceTrackerScreen";
import ReportsCenterScreen from "../screens/ReportsCenterScreen";
import RestaurantFloorPlanScreen from "../screens/RestaurantFloorPlanScreen";
import RestaurantLoyaltyScreen from "../screens/RestaurantLoyaltyScreen";
import RestaurantMenuScreen from "../screens/RestaurantMenuScreen";
import RestaurantOnlineOrderingScreen from "../screens/RestaurantOnlineOrderingScreen";
import RestaurantOrdersScreen from "../screens/RestaurantOrdersScreen";
import SDKTokensScreen from "../screens/SDKTokensScreen";
import SIPInvestmentsScreen from "../screens/SIPInvestmentsScreen";
import SalaryAccountsScreen from "../screens/SalaryAccountsScreen";
import SavedBeneficiariesScreen from "../screens/SavedBeneficiariesScreen";
import SettingsPaymentsScreen from "../screens/SettingsPaymentsScreen";
import SettlementForecastScreen from "../screens/SettlementForecastScreen";
import SettlementSLAScreen from "../screens/SettlementSLAScreen";
import SettlementsScreen from "../screens/SettlementsScreen";
import SlaAlertDashboardScreen from "../screens/SlaAlertDashboardScreen";
import SlaBreachesScreen from "../screens/SlaBreachesScreen";
import SmartRetailPOSScreen from "../screens/SmartRetailPOSScreen";
import SplitBillV2Screen from "../screens/SplitBillV2Screen";
import SplitPaymentsScreen from "../screens/SplitPaymentsScreen";
import StaffManagementScreen from "../screens/StaffManagementScreen";
import StripeSubscriptionsScreen from "../screens/StripeSubscriptionsScreen";
import SubscriptionBillingV2Screen from "../screens/SubscriptionBillingV2Screen";
import SubscriptionManagementScreen from "../screens/SubscriptionManagementScreen";
import SubscriptionsPageScreen from "../screens/SubscriptionsPageScreen";
import SuperAgentManagementScreen from "../screens/SuperAgentManagementScreen";
import SupportAdminScreen from "../screens/SupportAdminScreen";
import SupportChatScreen from "../screens/SupportChatScreen";
import TaxEngineScreen from "../screens/TaxEngineScreen";
import TaxFilingV2Screen from "../screens/TaxFilingV2Screen";
import TenantAdminDashboardScreen from "../screens/TenantAdminDashboardScreen";
import TenantApiKeysScreen from "../screens/TenantApiKeysScreen";
import TenantBillingCronScreen from "../screens/TenantBillingCronScreen";
import TenantBillingDashboardScreen from "../screens/TenantBillingDashboardScreen";
import TenantBrandingAdminScreen from "../screens/TenantBrandingAdminScreen";
import TenantProvisioningScreen from "../screens/TenantProvisioningScreen";
import TenantSsoConfigScreen from "../screens/TenantSsoConfigScreen";
import TenantStripeBillingScreen from "../screens/TenantStripeBillingScreen";
import TerminalMapScreen from "../screens/TerminalMapScreen";
import TransactionReceiptsScreen from "../screens/TransactionReceiptsScreen";
import TransactionReceiptsV2Screen from "../screens/TransactionReceiptsV2Screen";
import UPIGatewayScreen from "../screens/UPIGatewayScreen";
import USDCPayoutsScreen from "../screens/USDCPayoutsScreen";
import USSDServicesScreen from "../screens/USSDServicesScreen";
import USSDSessionsScreen from "../screens/USSDSessionsScreen";
import UsdcV3Screen from "../screens/UsdcV3Screen";
import UssdMenuBuilderScreen from "../screens/UssdMenuBuilderScreen";
import VendorsScreen from "../screens/VendorsScreen";
import VoicePaymentsScreen from "../screens/VoicePaymentsScreen";
import WAFAlertDashboardScreen from "../screens/WAFAlertDashboardScreen";
import WealthManagementScreen from "../screens/WealthManagementScreen";
import WebhookDeliveriesScreen from "../screens/WebhookDeliveriesScreen";
import WebhookEventsPageScreen from "../screens/WebhookEventsPageScreen";
import WebhookLiveStreamScreen from "../screens/WebhookLiveStreamScreen";
import WebhookSimV2Screen from "../screens/WebhookSimV2Screen";
import WebhookSimulatorV2Screen from "../screens/WebhookSimulatorV2Screen";
import WhiteLabelPreviewScreen from "../screens/WhiteLabelPreviewScreen";
import WhiteLabelSDKScreen from "../screens/WhiteLabelSDKScreen";
import WorkflowObservabilityScreen from "../screens/WorkflowObservabilityScreen";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  APIKeys: undefined;
  Webhooks: undefined;
  Notifications: undefined;
  Disputes: undefined;
  VirtualCards: undefined;
  Settings: undefined;
  Payroll: undefined;
  TeamRoles: undefined;
  MobileMoneyRecon: undefined;
  FXDashboard: undefined;
  Checkout: undefined;
  BillPayments: undefined;
  CarbonCredits: undefined;
  Subscriptions: undefined;
  Coupons: undefined;
  BillingEngine: undefined;
  AdminOverview: undefined;
  AIHub: undefined;
  Auth: undefined;
  Billing: undefined;
  Crypto: undefined;
  Escrow: undefined;
  Insurance: undefined;
  KYBDocumentUpload: undefined;
  Loyalty: undefined;
  MobileMoney: undefined;
  NIP: undefined;
  POS: undefined;
  Profile: undefined;
  SIP: undefined;
  Team: undefined;
  USSD: undefined;

  // Wave 159+ routes
  AIInsights: undefined;
  AIInsightsV2: undefined;
  AIModelAdmin: undefined;
  AMLMonitor: undefined;
  APIDocsPortal: undefined;
  ActiveSessions: undefined;
  AdminAuditLog: undefined;
  AdminCompliance: undefined;
  AdminFraudOversight: undefined;
  AdminKYCReview: undefined;
  AdminMerchantManagement: undefined;
  AdminPayoutApproval: undefined;
  AdminPlatformOverview: undefined;
  AdminRevenue: undefined;
  AgentBanking: undefined;
  AuditLog: undefined;
  AuditLogViewer: undefined;
  AuthEvents: undefined;
  BNPLCalculator: undefined;
  BNPLRepaymentPage: undefined;
  BNPL: undefined;
  BillingAnalytics: undefined;
  BillingConfig: undefined;
  BnplRepaymentTracker: undefined;
  BulkCollections: undefined;
  CIPSGateway: undefined;
  CarbonCreditsLedger: undefined;
  CashbackRewards: undefined;
  ChargebackCases: undefined;
  Chargebacks: undefined;
  ClaimDocuments: undefined;
  ComplianceKYC: undefined;
  ComplianceReports: undefined;
  Compliance: undefined;
  ComplianceSettings: undefined;
  ConsumerAnalytics: undefined;
  ConsumerDisputes: undefined;
  ConsumerInsurance: undefined;
  ConsumerLoans: undefined;
  ConsumerLoyaltyApp: undefined;
  CorridorLiveStats: undefined;
  CorridorManagement: undefined;
  CouponManagement: undefined;
  CrossBorderRailMonitor: undefined;
  CrossBorder: undefined;
  CryptoWallet: undefined;
  DataExport: undefined;
  DeveloperPortal: undefined;
  DeveloperSandbox: undefined;
  DigitalGold: undefined;
  DisputeEscalation: undefined;
  DisputeWorkflow: undefined;
  EMICheckout: undefined;
  EMILoansPage: undefined;
  EMIManagement: undefined;
  EscrowAccounts: undefined;
  EscrowContracts: undefined;
  FX: undefined;
  FeeSchedules: undefined;
  FraudAlertComments: undefined;
  FraudAlertsDashboard: undefined;
  FraudRisk: undefined;
  FraudRules: undefined;
  FxHedgingWorkflow: undefined;
  GeofenceAlerts: undefined;
  GiftCards: undefined;
  GoLiveChecklist: undefined;
  GoldSIP: undefined;
  InsuranceClaims: undefined;
  InsuranceHub: undefined;
  InsurancePage: undefined;
  InsurancePolicies: undefined;
  InternationalRemittance: undefined;
  Inventory: undefined;
  InvoiceFinancing: undefined;
  Invoices: undefined;
  KYBVerifications: undefined;
  KeycloakRoleSync: undefined;
  KioskHealth: undefined;
  KitchenDisplay: undefined;
  LakehouseAIDashboard: undefined;
  LivenessCheck: undefined;
  LoanRepayments: undefined;
  LoyaltyAutoPromotion: undefined;
  LoyaltyDashboard: undefined;
  LoyaltyLedger: undefined;
  LoyaltyProgram: undefined;
  LoyaltyV3: undefined;
  MarketDataDashboard: undefined;
  MenuManagement: undefined;
  MerchantAnalyticsDashboard: undefined;
  MerchantLending: undefined;
  MerchantNotificationPreferences: undefined;
  MicroserviceHealth: undefined;
  MiddlewareDashboard: undefined;
  MobilePOS: undefined;
  MojaloopDashboard: undefined;
  MultiCurrency: undefined;
  MutualFunds: undefined;
  NIPBanks: undefined;
  NIPTransfers: undefined;
  NodalAccounts: undefined;
  NotificationsCenter: undefined;
  OllamaChat: undefined;
  PIXGateway: undefined;
  POSReconciliation: undefined;
  POSTerminals: undefined;
  POSTransactions: undefined;
  PTSPSettlement: undefined;
  PartnerAdminDashboard: undefined;
  PartnerOnboard: undefined;
  PaymentLinks: undefined;
  PayoutBatching: undefined;
  PensionNPS: undefined;
  PortalHealthDashboard: undefined;
  PortfolioRebalancing: undefined;
  PricingPage: undefined;
  PrivacyPayments: undefined;
  PtspBatches: undefined;
  PurchaseOrders: undefined;
  QRGenerator: undefined;
  QRPayments: undefined;
  QuickPay: undefined;
  RateLimitDashboard: undefined;
  ReconciliationAlerts: undefined;
  Reconciliation: undefined;
  RedEnvelopes: undefined;
  ReferralProgram: undefined;
  Referrals: undefined;
  RefundWorkflow: undefined;
  RemittanceTracker: undefined;
  ReportsCenter: undefined;
  RestaurantFloorPlan: undefined;
  RestaurantLoyalty: undefined;
  RestaurantMenu: undefined;
  RestaurantOnlineOrdering: undefined;
  RestaurantOrders: undefined;
  SDKTokens: undefined;
  SIPInvestments: undefined;
  SalaryAccounts: undefined;
  SavedBeneficiaries: undefined;
  SettingsPayments: undefined;
  SettlementForecast: undefined;
  SettlementSLA: undefined;
  Settlements: undefined;
  SlaAlertDashboard: undefined;
  SlaBreaches: undefined;
  SmartRetailPOS: undefined;
  SplitBillV2: undefined;
  SplitPayments: undefined;
  StaffManagement: undefined;
  StripeSubscriptions: undefined;
  SubscriptionBillingV2: undefined;
  SubscriptionManagement: undefined;
  SubscriptionsPage: undefined;
  SuperAgentManagement: undefined;
  SupportAdmin: undefined;
  SupportChat: undefined;
  TaxEngine: undefined;
  TaxFilingV2: undefined;
  TenantAdminDashboard: undefined;
  TenantApiKeys: undefined;
  TenantBillingCron: undefined;
  TenantBillingDashboard: undefined;
  TenantBrandingAdmin: undefined;
  TenantProvisioning: undefined;
  TenantSsoConfig: undefined;
  TenantStripeBilling: undefined;
  TerminalMap: undefined;
  TransactionReceipts: undefined;
  TransactionReceiptsV2: undefined;
  UPIGateway: undefined;
  USDCPayouts: undefined;
  USSDServices: undefined;
  USSDSessions: undefined;
  UsdcV3: undefined;
  UssdMenuBuilder: undefined;
  Vendors: undefined;
  VoicePayments: undefined;
  WAFAlertDashboard: undefined;
  WealthManagement: undefined;
  WebhookDeliveries: undefined;
  WebhookEventsPage: undefined;
  WebhookLiveStream: undefined;
  WebhookSimV2: undefined;
  WebhookSimulatorV2: undefined;
  WhiteLabelPreview: undefined;
  WhiteLabelSDK: undefined;
  WorkflowObservability: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  Customers: undefined;
  Payouts: undefined;
  Analytics: undefined;
  Loyalty: undefined;
  NIP: undefined;
  MobileMoney: undefined;
  Insurance: undefined;
};

// ─── Theme ────────────────────────────────────────────────────────────────────

const colors = {
  primary: "#6366F1",
  background: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  muted: "#94A3B8",
  border: "#334155",
  tabActive: "#6366F1",
  tabInactive: "#64748B",
};

// ─── Tab Icon ─────────────────────────────────────────────────────────────────

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: "⊞",
    Transactions: "⇄",
    Customers: "◉",
    Payouts: "↑",
    Analytics: "▲",
    Loyalty: "★",
    NIP: "⚡",
    "M-Money": "₦",
    Insurance: "🛡",
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.5 }]}>
        {icons[label] ?? "•"}
      </Text>
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? colors.tabActive : colors.tabInactive },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Dashboard" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Transactions" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Customers" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Payouts"
        component={PayoutsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Payouts" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Analytics" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Loyalty"
        component={LoyaltyScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Loyalty" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="NIP"
        component={NIPScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="NIP" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="MobileMoney"
        component={MobileMoneyScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="M-Money" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Insurance"
        component={InsuranceScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Insurance" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Stack Navigator ─────────────────────────────────────────────────────

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: {
          regular: { fontFamily: "System", fontWeight: "400" },
          medium: { fontFamily: "System", fontWeight: "500" },
          bold: { fontFamily: "System", fontWeight: "700" },
          heavy: { fontFamily: "System", fontWeight: "900" },
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="APIKeys"
          component={APIKeysScreen}
          options={{ title: "API Keys" }}
        />
        <Stack.Screen
          name="Webhooks"
          component={WebhooksScreen}
          options={{ title: "Webhooks" }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: "Notifications" }}
        />
        <Stack.Screen
          name="Disputes"
          component={DisputesScreen}
          options={{ title: "Disputes" }}
        />
        <Stack.Screen
          name="VirtualCards"
          component={VirtualCardsScreen}
          options={{ title: "Virtual Cards" }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Settings" }}
        />
        <Stack.Screen
          name="Payroll"
          component={PayrollScreen}
          options={{ title: "Payroll" }}
        />
        <Stack.Screen
          name="TeamRoles"
          component={TeamRolesScreen}
          options={{ title: "Team & Roles" }}
        />
        <Stack.Screen
          name="MobileMoneyRecon"
          component={MobileMoneyReconScreen}
          options={{ title: "Mobile Money Recon" }}
        />
        <Stack.Screen
          name="FXDashboard"
          component={FXDashboardScreen}
          options={{ title: "FX Dashboard" }}
        />
        <Stack.Screen
          name="Checkout"
          component={CheckoutScreen}
          options={{ title: "Checkout Links" }}
        />
        <Stack.Screen
          name="BillPayments"
          component={BillPaymentsScreen}
          options={{ title: "Bill Payments" }}
        />
        <Stack.Screen
          name="CarbonCredits"
          component={CarbonCreditsScreen}
          options={{ title: "Carbon Credits" }}
        />
        <Stack.Screen
          name="Subscriptions"
          component={SubscriptionsScreen}
          options={{ title: "Subscriptions" }}
        />
        <Stack.Screen
          name="Coupons"
          component={CouponsScreen}
          options={{ title: "Coupons" }}
        />
        <Stack.Screen
          name="BillingEngine"
          component={BillingEngineScreen}
          options={{ title: "Billing Engine" }}
        />
        <Stack.Screen
          name="AdminOverview"
          component={AdminOverviewScreen}
          options={{ title: "Admin Overview" }}
        />
        <Stack.Screen
          name="AIHub"
          component={AIHubScreen}
          options={{ title: "AI Insights Hub" }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: "Sign In", headerShown: false }}
        />
        <Stack.Screen
          name="Billing"
          component={BillingScreen}
          options={{ title: "Billing" }}
        />
        <Stack.Screen
          name="Crypto"
          component={CryptoScreen}
          options={{ title: "Crypto Wallet" }}
        />
        <Stack.Screen
          name="Escrow"
          component={EscrowScreen}
          options={{ title: "Escrow Accounts" }}
        />
        <Stack.Screen
          name="Insurance"
          component={InsuranceScreen}
          options={{ title: "Insurance" }}
        />
        <Stack.Screen
          name="KYBDocumentUpload"
          component={KYBDocumentUploadScreen}
          options={{ title: "KYB Document Upload" }}
        />
        <Stack.Screen
          name="Loyalty"
          component={LoyaltyScreen}
          options={{ title: "Loyalty Program" }}
        />
        <Stack.Screen
          name="MobileMoney"
          component={MobileMoneyScreen}
          options={{ title: "Mobile Money" }}
        />
        <Stack.Screen
          name="NIP"
          component={NIPScreen}
          options={{ title: "NIP Transfer" }}
        />
        <Stack.Screen
          name="POS"
          component={POSScreen}
          options={{ title: "POS Terminals" }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: "My Profile" }}
        />
        <Stack.Screen
          name="SIP"
          component={SIPScreen}
          options={{ title: "SIP Investments" }}
        />
        <Stack.Screen
          name="Team"
          component={TeamScreen}
          options={{ title: "Team" }}
        />
        <Stack.Screen
          name="USSD"
          component={USSDScreen}
          options={{ title: "USSD Services" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  tabEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
});
