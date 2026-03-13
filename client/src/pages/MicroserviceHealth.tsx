import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useState } from "react";

interface ServiceInfo {
  name: string;
  key: string;
  language: "rust" | "python" | "go";
  port: number;
  envVar: string;
  description: string;
  startCmd: string;
}

const SERVICES: ServiceInfo[] = [
  {
    name: "Inventory Engine",
    key: "inventory-engine",
    language: "rust",
    port: 8091,
    envVar: "INVENTORY_ENGINE_URL",
    description: "Recipe costing, COGS calculation, stock adjustments",
    startCmd: "cd paygate-middleware/rust/inventory-engine && cargo run --release",
  },
  {
    name: "Loyalty Ledger",
    key: "loyalty-ledger",
    language: "rust",
    port: 8092,
    envVar: "LOYALTY_LEDGER_URL",
    description: "Points earn/redeem with double-entry ledger",
    startCmd: "cd paygate-middleware/rust/loyalty-ledger && cargo run --release",
  },
  {
    name: "Payroll Service",
    key: "payroll-service",
    language: "python",
    port: 8093,
    envVar: "PAYROLL_SERVICE_URL",
    description: "Staff hours, PAYE tax, tip pooling, disbursement stubs",
    startCmd: "cd paygate-middleware/python/payroll && uvicorn payroll_service:app --port 8093",
  },
  {
    name: "Kiosk Health",
    key: "kiosk-health",
    language: "python",
    port: 8094,
    envVar: "KIOSK_HEALTH_URL",
    description: "Anomaly detection, geofence violation scoring",
    startCmd: "cd paygate-middleware/python/kiosk_health && uvicorn kiosk_health_service:app --port 8094",
  },
  {
    name: "Fraud Scoring",
    key: "fraud-scoring",
    language: "python",
    port: 8083,
    envVar: "FRAUD_SCORING_URL",
    description: "Real-time transaction risk scoring",
    startCmd: "cd paygate-middleware/python/fraud_scoring && uvicorn fraud_service:app --port 8083",
  },
  {
    name: "USSD Gateway",
    key: "ussd-gateway",
    language: "go",
    port: 8080,
    envVar: "USSD_GATEWAY_URL",
    description: "USSD session management and balance queries",
    startCmd: "cd paygate-middleware && go run ./wiring",
  },
];

const LANG_COLORS: Record<string, string> = {
  rust: "bg-orange-100 text-orange-800 border-orange-200",
  python: "bg-blue-100 text-blue-800 border-blue-200",
  go: "bg-cyan-100 text-cyan-800 border-cyan-200",
};

export default function MicroserviceHealth() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, refetch } = trpc.system.microservicesHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const onlineCount = data ? Object.values(data).filter((v) => v === "ok").length : 0;
  const totalCount = SERVICES.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Microservice Health</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Optional Rust, Python, and Go services. When offline, the platform falls back to direct database operations.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); setRefreshKey((k) => k + 1); }}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : onlineCount}</p>
                <p className="text-sm text-muted-foreground">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : totalCount - onlineCount}</p>
                <p className="text-sm text-muted-foreground">Offline (DB fallback)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-muted-foreground">Total services</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {SERVICES.map((svc) => {
          const status = data?.[svc.key];
          const isOnline = status === "ok";
          const isUnknown = !data && !isLoading;

          return (
            <Card key={svc.key} className={`border-l-4 ${isOnline ? "border-l-green-500" : "border-l-red-400"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{svc.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${LANG_COLORS[svc.language]}`}>
                      {svc.language}
                    </Badge>
                    {isLoading ? (
                      <Badge variant="secondary" className="text-xs">Checking…</Badge>
                    ) : isOnline ? (
                      <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Online</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Offline</Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs">{svc.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Port: <code className="bg-muted px-1 rounded">{svc.port}</code></span>
                  <span>Env: <code className="bg-muted px-1 rounded">{svc.envVar}</code></span>
                </div>

                {!isOnline && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        Start command:
                      </p>
                      <code className="block text-xs bg-muted p-2 rounded font-mono break-all">
                        {svc.startCmd}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Then set <code className="bg-muted px-1 rounded">{svc.envVar}=http://localhost:{svc.port}</code> in{" "}
                        <a href="#" className="underline text-primary">Settings → Secrets</a>.
                      </p>
                    </div>
                  </>
                )}

                {isOnline && (
                  <div className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    High-performance mode active — DB fallback disabled
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ENV docs link */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Full startup documentation</p>
              <p className="text-xs text-muted-foreground">
                See <code className="bg-muted px-1 rounded">ENV_DOCS.md</code> in the project root for complete environment variable reference and Docker Compose templates for all services.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
