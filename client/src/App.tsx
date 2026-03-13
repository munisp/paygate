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
import Disputes from "./pages/Disputes";
import Onboarding from "./pages/Onboarding";
import PaymentLinks from "./pages/PaymentLinks";
import FraudRisk from "./pages/FraudRisk";
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
import KitchenDisplay from "./pages/KitchenDisplay";
import Inventory from "./pages/Inventory";
import Payroll from "./pages/Payroll";
import GeofenceAlerts from "./pages/GeofenceAlerts";
import MicroserviceHealth from "./pages/MicroserviceHealth";
import AdminSetup from "./pages/AdminSetup";
import GoLiveChecklist from "./pages/GoLiveChecklist";

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/" || location === "/login" || location === "/onboarding";
  const isConsumerPage = location.startsWith("/consumer");

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
        <Route path="/disputes" component={Disputes} />
        <Route path="/disputes/:id" component={DisputeWorkflow} />
        <Route path="/payment-links" component={PaymentLinks} />
        <Route path="/fraud-risk" component={FraudRisk} />
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
        <Route path="/kitchen-display" component={KitchenDisplay} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/geofence-alerts" component={GeofenceAlerts} />
      <Route path="/microservice-health" component={MicroserviceHealth} />
      <Route path="/admin-setup" component={AdminSetup} />
      <Route path="/go-live" component={GoLiveChecklist} />
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
