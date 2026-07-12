import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import GatewayPage from "./pages/GatewayPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import PoolPage from "./pages/PoolPage";
import OverviewPage from "./pages/OverviewPage";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <DashboardLayout>
            <Switch>
              <Route path="/" component={OverviewPage} />
              <Route path="/gateway" component={GatewayPage} />
              <Route path="/workflows" component={WorkflowsPage} />
              <Route path="/pool" component={PoolPage} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
