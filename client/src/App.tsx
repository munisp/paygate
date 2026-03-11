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
