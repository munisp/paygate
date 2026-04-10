import { Toaster } from "@/components/ui/sonner";
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
import GoLiveChecklist from "./pages/GoLiveChecklist";
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
      <Route path="/go-live" component={GoLiveChecklist} />
        <Route path="/quick-pay" component={QuickPay} />
        <Route path="/notifications" component={NotificationsCenter} />
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/settlements" component={Settlements} />
        {/* Tier 1-5 New Features */}
        <Route path="/lending" component={MerchantLending} />
        <Route path="/split-payments" component={SplitPayments} />
        <Route path="/recurring-billing" component={RecurringBilling} />
        <Route path="/dcc" component={DCCDashboard} />
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
        <Route component={Dashboard} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
