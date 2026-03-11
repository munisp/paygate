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

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/" || location === "/login" || location === "/onboarding";

  if (isAuthPage) {
    return (
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
      </Switch>
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
        <Route path="/payment-links" component={PaymentLinks} />
        <Route path="/fraud-risk" component={FraudRisk} />
        <Route path="/api-keys" component={APIKeys} />
        <Route path="/webhooks" component={Webhooks} />
        <Route path="/settings" component={Settings} />
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
