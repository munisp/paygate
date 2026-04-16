import { Toaster } from "@/components/ui/sonner";
import OfflineIndicator from "@/components/OfflineIndicator";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PWAUpdateToast } from "@/components/PWAUpdateToast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Customers from "./pages/Customers";
import VirtualCards from "./pages/VirtualCards";
import Analytics from "./pages/Analytics";
import Checkout from "./pages/Checkout";
import APIKeys from "./pages/APIKeys";
import Webhooks from "./pages/Webhooks";
import Settings from "./pages/Settings";
import Payouts from "./pages/Payouts";
import USDCPayouts from "./pages/USDCPayouts";
import Disputes from "./pages/Disputes";
import Onboarding from "./pages/Onboarding";
import PaymentLinks from "./pages/PaymentLinks";
import FraudRisk from "./pages/FraudRisk";
import ReconciliationAlerts from "./pages/ReconciliationAlerts";
import BNPL from "./pages/BNPL";
import FXDashboard from "./pages/FXDashboard";
import TeamRoles from "./pages/TeamRoles";
import MobileMoneyRecon from "./pages/MobileMoneyRecon";
import ComplianceKYC from "./pages/ComplianceKYC";
import ComplianceSettings from "./pages/ComplianceSettings";
import DisputeWorkflow from "./pages/DisputeWorkflow";
import QRPayments from "./pages/QRPayments";

// Consumer PWA pages
import ConsumerLayout from "./pages/consumer/ConsumerLayout";
import ConsumerWallet from "./pages/consumer/ConsumerWallet";
import MakePayment from "./pages/consumer/MakePayment";
import BillPay from "./pages/consumer/BillPay";
import ConsumerProfile from "./pages/consumer/ConsumerProfile";
import ConsumerHistory from "./pages/consumer/History";
import ConsumerQuickPay from "./pages/consumer/ConsumerQuickPay";
import ConsumerNotifications from "./pages/consumer/ConsumerNotifications";
import ConsumerOnboarding from "./pages/consumer/ConsumerOnboarding";
import RedEnvelope from "./pages/consumer/RedEnvelope";
// Wave 68 Consumer Pages
import QRScanPay from "./pages/consumer/QRScanPay";
import RequestMoney from "./pages/consumer/RequestMoney";
import Contacts from "./pages/consumer/Contacts";
import Loyalty from "./pages/consumer/Loyalty";
import Coupons from "./pages/consumer/Coupons";
import ConsumerCard from "./pages/consumer/ConsumerCard";
import RecurringPayments from "./pages/consumer/RecurringPayments";
import SplitBill from "./pages/consumer/SplitBill";
import PINSetup from "./pages/consumer/PINSetup";
import ConsumerKYC from "./pages/consumer/ConsumerKYC";
import Discover from "./pages/consumer/Discover";
import ConsumerCrossBorder from "./pages/consumer/ConsumerCrossBorder";
import ConsumerAnalytics from "./pages/ConsumerAnalytics";
import ConsumerDisputes from "./pages/ConsumerDisputes";
import CrossBorder from "./pages/CrossBorder";
import DeveloperPortal from "./pages/DeveloperPortal";
import WorkflowObservability from "./pages/WorkflowObservability";
import KeycloakRoleSync from "./pages/KeycloakRoleSync";
import NIPBanks from "./pages/NIPBanks";
import Subscriptions from "./pages/Subscriptions";
import POSTerminals from "./pages/POSTerminals";
import TerminalMap from "./pages/TerminalMap";
import POSReconciliation from "./pages/POSReconciliation";
import PTSPSettlement from "./pages/PTSPSettlement";
import PtspBatches from "./pages/PtspBatches";
import AgentBanking from "./pages/AgentBanking";
import KioskHealth from "./pages/KioskHealth";
import RestaurantFloorPlan from "./pages/RestaurantFloorPlan";
import RestaurantOrders from "./pages/RestaurantOrders";
import RestaurantMenu from "./pages/RestaurantMenu";
import RestaurantLoyalty from "./pages/RestaurantLoyalty";
import RestaurantOnlineOrdering, { PublicOrderPage } from "./pages/RestaurantOnlineOrdering";
import KitchenDisplay from "./pages/KitchenDisplay";
import Inventory from "./pages/Inventory";
import Payroll from "./pages/Payroll";
import GeofenceAlerts from "./pages/GeofenceAlerts";
import MicroserviceHealth from "./pages/MicroserviceHealth";
import AdminSetup from "./pages/AdminSetup";
import AdminPlatformOverview from "./pages/admin/AdminPlatformOverview";
import AdminMerchantManagement from "./pages/admin/AdminMerchantManagement";
import AdminKYCReview from "./pages/admin/AdminKYCReview";
import AdminDisputeManagement from "./pages/admin/AdminDisputeManagement";
import AdminFraudOversight from "./pages/admin/AdminFraudOversight";
import AdminRevenue from "./pages/admin/AdminRevenue";
import AdminSettlements from "./pages/admin/AdminSettlements";
import AdminCompliance from "./pages/admin/AdminCompliance";
import AdminSystemHealth from "./pages/admin/AdminSystemHealth";
import AdminAuditTrail from "./pages/admin/AdminAuditTrail";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminConfig from "./pages/admin/AdminConfig";
import OllamaChat from "./pages/OllamaChat";
import GoLiveChecklist from "./pages/GoLiveChecklist";
import SettingsPayments from "./pages/SettingsPayments";
import QuickPay from "./pages/QuickPay";
import NotificationsCenter from "./pages/NotificationsCenter";
import AuditLog from "./pages/AuditLog";
import PurchaseOrders from "./pages/PurchaseOrders";
import Vendors from "./pages/Vendors";
import Settlements from "./pages/Settlements";
import MerchantLending from "./pages/MerchantLending";
import SplitPayments from "./pages/SplitPayments";
import RecurringBilling from "./pages/tier1to5/RecurringBilling";
import DCCDashboard from "./pages/tier1to5/DCCDashboard";
import ReconciliationEngine from "./pages/tier1to5/ReconciliationEngine";
import InvoiceBuilder from "./pages/tier1to5/InvoiceBuilder";
import ChargebackAutomation from "./pages/tier1to5/ChargebackAutomation";
import AMLMonitor from "./pages/tier1to5/AMLMonitor";
import KYBWorkflow from "./pages/tier1to5/KYBWorkflow";
import SessionRisk from "./pages/tier1to5/SessionRisk";
import OpenBanking from "./pages/tier1to5/OpenBanking";
import LoyaltyEngine from "./pages/tier1to5/LoyaltyEngine";
import EmbeddedFinance from "./pages/tier1to5/EmbeddedFinance";
import AIInsights from "./pages/tier1to5/AIInsights";
import FraudHeatmap from "./pages/tier1to5/FraudHeatmap";
import InsurancePremium from "./pages/tier6to8/InsurancePremium";
import CarbonCredit from "./pages/tier6to8/CarbonCredit";
import NFTBadges from "./pages/tier6to8/NFTBadges";
import BNPLv2 from "./pages/tier6to8/BNPLv2";
import CryptoRamp from "./pages/tier6to8/CryptoRamp";
import EscrowService from "./pages/tier6to8/EscrowService";
import BulkScheduler from "./pages/tier6to8/BulkScheduler";
import TaxWithholding from "./pages/tier6to8/TaxWithholding";
import RegulatorySandbox from "./pages/tier6to8/RegulatorySandbox";
import MultiCurrencyWallet from "./pages/tier6to8/MultiCurrencyWallet";
import RTGSDashboard from "./pages/tier6to8/RTGSDashboard";
import ISO20022 from "./pages/tier6to8/ISO20022";
import OpenFinanceHub from "./pages/tier6to8/OpenFinanceHub";
import WhiteLabelSDK from "./pages/tier6to8/WhiteLabelSDK";
import SuperApp from "./pages/tier6to8/SuperApp";
import LakehouseV2 from "./pages/tier6to8/LakehouseV2";
import PayrollV2 from "./pages/tier6to8/PayrollV2";
import SettlementForecast from "./pages/SettlementForecast";
import TaxEngine from "./pages/TaxEngine";
import AgentNetwork from "./pages/tier6to8/AgentNetwork";
import SDKPortal from "./pages/tier6to8/SDKPortal";
import CohortAnalytics from "./pages/tier1to5/CohortAnalytics";
import POSv2 from "./pages/tier6to8/POSv2";
import RemittanceV2 from "./pages/tier6to8/RemittanceV2";
import DisputeAutomation from "./pages/tier1to5/DisputeAutomation";
import OpenBankingPortal from "./pages/tier1to5/OpenBankingPortal";
import MerchantLendingV2 from "./pages/tier1to5/MerchantLending";
import MobilePOS from "./pages/MobilePOS";
// New Feature Pages (20)
import DigitalGold from "./pages/DigitalGold";
import MutualFunds from "./pages/MutualFunds";
import ConsumerInsurance from "./pages/ConsumerInsurance";
import PensionNPS from "./pages/PensionNPS";
import CashbackRewards from "./pages/CashbackRewards";
import VoicePayments from "./pages/VoicePayments";
import WealthManagement from "./pages/WealthManagement";
import EMICheckout from "./pages/EMICheckout";
import BulkCollections from "./pages/BulkCollections";
import APIDocsPortal from "./pages/APIDocsPortal";
import SalaryAccounts from "./pages/SalaryAccounts";
import PrivacyPayments from "./pages/PrivacyPayments";
import ReportsCenter from "./pages/ReportsCenter";
import AIInsightsV2 from "./pages/AIInsightsV2";
import NodalAccounts from "./pages/NodalAccounts";
import SmartRetailPOS from "./pages/SmartRetailPOS";
import InternationalRemittance from "./pages/InternationalRemittance";
import SubscriptionBillingV2 from "./pages/SubscriptionBillingV2";
import Billing from "./pages/Billing";
// Wave 80 Pages
import OpenBankingV2 from "./pages/wave80/OpenBankingV2";
import CarbonCreditsV2 from "./pages/wave80/CarbonCreditsV2";
import AgentBankingV4 from "./pages/wave80/AgentBankingV4";
import SuperAgentV2 from "./pages/wave80/SuperAgentV2";
import EscrowV2 from "./pages/wave80/EscrowV2";
import MarketplacePay from "./pages/wave80/MarketplacePay";
import LoyaltyV3 from "./pages/wave80/LoyaltyV3";
import CryptoOfframpV2 from "./pages/wave80/CryptoOfframpV2";
import NfcPay from "./pages/wave80/NfcPay";
import QrMerchantAnalytics from "./pages/wave80/QrMerchantAnalytics";
import InvoiceFinancingV2 from "./pages/wave80/InvoiceFinancingV2";
import PayrollV3 from "./pages/wave80/PayrollV3";
import TaxFiling from "./pages/wave80/TaxFiling";
import RegulatoryReporting from "./pages/wave80/RegulatoryReporting";
import UsdcV2 from "./pages/wave80/UsdcV2";
import MultiCurrencyLedger from "./pages/wave80/MultiCurrencyLedger";
import TemporalWorkflowMgmt from "./pages/wave80/TemporalWorkflowMgmt";
import GrpcHealthCheck from "./pages/wave80/GrpcHealthCheck";
import UssdSessionV2 from "./pages/wave80/UssdSessionV2";
import RealtimeNotifications from "./pages/wave80/RealtimeNotifications";
// Wave 84 Pages
import QRGenerator from "./pages/QRGenerator";
import USSDSessions from "./pages/USSDSessions";
import DeveloperSandbox from "./pages/DeveloperSandbox";
import NotificationCentre from "./pages/consumer/NotificationCentre";
import WalletStatement from "./pages/consumer/WalletStatement";
import KYBVerification from "./pages/KYBVerification";
import ComplianceReports from "./pages/ComplianceReports";
import SDKTokens from "./pages/SDKTokens";

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/" || location === "/login" || location === "/onboarding";
  const isConsumerPage = location.startsWith("/consumer");

  // Public ordering page — no auth required
  const isOrderPage = location.startsWith("/order/");
  if (isOrderPage) {
    const slug = location.replace("/order/", "");
    return <PublicOrderPage slug={slug} />;
  }

  if (isAuthPage) {
    return (
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
      </Switch>
    );
  }

  if (isConsumerPage) {
    return (
      <ConsumerLayout>
        <Switch>
          <Route path="/consumer" component={ConsumerWallet} />
          <Route path="/consumer/send" component={MakePayment} />
          <Route path="/consumer/qr" component={QRPayments} />
          <Route path="/consumer/bills" component={BillPay} />
          <Route path="/consumer/profile" component={ConsumerProfile} />
          <Route path="/consumer/history" component={ConsumerHistory} />
          <Route path="/consumer/quick-pay" component={ConsumerQuickPay} />
          <Route path="/consumer/notifications" component={ConsumerNotifications} />
          <Route path="/consumer/onboarding" component={ConsumerOnboarding} />
          <Route path="/consumer/red-envelope/:id" component={RedEnvelope} />
          <Route path="/consumer/red-envelope" component={RedEnvelope} />
          {/* Wave 68 Consumer Routes */}
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
          {/* Wave 84 Consumer Routes */}
          <Route path="/consumer/notification-centre" component={NotificationCentre} />
          <Route path="/consumer/statement" component={WalletStatement} />
          <Route component={ConsumerWallet} />
        </Switch>
      </ConsumerLayout>
    );
  }

  return (
    <Layout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/customers" component={Customers} />
        <Route path="/virtual-cards" component={VirtualCards} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/payouts" component={Payouts} />
        <Route path="/usdc-payouts" component={USDCPayouts} />
        <Route path="/disputes" component={Disputes} />
        <Route path="/disputes/:id" component={DisputeWorkflow} />
        <Route path="/payment-links" component={PaymentLinks} />
        <Route path="/fraud-risk" component={FraudRisk} />
        <Route path="/reconciliation-alerts" component={ReconciliationAlerts} />
        <Route path="/bnpl" component={BNPL} />
        <Route path="/fx" component={FXDashboard} />
        <Route path="/team" component={TeamRoles} />
        <Route path="/mobile-money" component={MobileMoneyRecon} />
        <Route path="/compliance" component={ComplianceKYC} />
        <Route path="/compliance/settings" component={ComplianceSettings} />
        <Route path="/api-keys" component={APIKeys} />
        <Route path="/webhooks" component={Webhooks} />
        <Route path="/settings" component={Settings} />
        <Route path="/qr-payments" component={QRPayments} />
        <Route path="/cross-border" component={CrossBorder} />
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
      <Route path="/admin/config" component={AdminConfig} />
      <Route path="/ollama-chat" component={OllamaChat} />
      <Route path="/go-live" component={GoLiveChecklist} />
      <Route path="/go-live-checklist" component={GoLiveChecklist} />
      <Route path="/settings/payments" component={SettingsPayments} />
        <Route path="/quick-pay" component={QuickPay} />
        <Route path="/notifications" component={NotificationsCenter} />
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/settlements" component={Settlements} />
        {/* Tier 1-5 New Features */}
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
        {/* Tier 6-8 New Features */}
        <Route path="/insurance" component={InsurancePremium} />
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
        {/* New Production Pages */}
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
        {/* New Feature Routes */}
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
        {/* Wave 80 Routes */}
        <Route path="/open-banking-v2" component={OpenBankingV2} />
        <Route path="/carbon-credits-v2" component={CarbonCreditsV2} />
        <Route path="/agent-banking-v4" component={AgentBankingV4} />
        <Route path="/super-agent-v2" component={SuperAgentV2} />
        <Route path="/escrow-v2" component={EscrowV2} />
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
        {/* Wave 84 Routes */}
        <Route path="/qr-generator" component={QRGenerator} />
        <Route path="/ussd-sessions" component={USSDSessions} />
        <Route path="/developer-sandbox" component={DeveloperSandbox} />
        {/* Wave 85 — Orphaned Table CRUD Pages */}
        <Route path="/kyb-verification" component={KYBVerification} />
        <Route path="/compliance-reports" component={ComplianceReports} />
        <Route path="/sdk-tokens" component={SDKTokens} />
        <Route component={Dashboard} />
      </Switch>
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
