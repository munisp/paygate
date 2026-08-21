// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Code2,
  ExternalLink,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { useAdaptiveInterval } from "@/lib/networkQuality";

interface ServiceInfo {
  name: string;
  key: string;
  language: "rust" | "python" | "go";
  port: number;
  envVar: string;
  description: string;
  startCmd: string;
  dockerImage?: string;
  requiredEnvVars: { key: string; description: string; required: boolean }[];
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
    dockerImage: "paygate/inventory-engine:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "INVENTORY_ENGINE_URL", description: "Set to http://localhost:8091 after starting", required: true },
      { key: "RUST_LOG", description: "Log level (info/debug/warn)", required: false },
    ],
  },
  {
    name: "Loyalty Ledger",
    key: "loyalty-ledger",
    language: "rust",
    port: 8092,
    envVar: "LOYALTY_LEDGER_URL",
    description: "Points earn/redeem with double-entry ledger",
    startCmd: "cd paygate-middleware/rust/loyalty-ledger && cargo run --release",
    dockerImage: "paygate/loyalty-ledger:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "LOYALTY_LEDGER_URL", description: "Set to http://localhost:8092 after starting", required: true },
      { key: "RUST_LOG", description: "Log level (info/debug/warn)", required: false },
    ],
  },
  {
    name: "Payroll Service",
    key: "payroll-service",
    language: "python",
    port: 8093,
    envVar: "PAYROLL_SERVICE_URL",
    description: "Staff hours, PAYE tax, tip pooling, disbursement stubs",
    startCmd: "cd paygate-middleware/python/payroll && uvicorn payroll_service:app --port 8093",
    dockerImage: "paygate/payroll-service:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "PAYROLL_SERVICE_URL", description: "Set to http://localhost:8093 after starting", required: true },
      { key: "PAYE_RATE", description: "PAYE tax rate (default: 0.07)", required: false },
    ],
  },
  {
    name: "Kiosk Health",
    key: "kiosk-health",
    language: "python",
    port: 8094,
    envVar: "KIOSK_HEALTH_URL",
    description: "Anomaly detection, geofence violation scoring",
    startCmd: "cd paygate-middleware/python/kiosk_health && uvicorn kiosk_health_service:app --port 8094",
    dockerImage: "paygate/kiosk-health:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "KIOSK_HEALTH_URL", description: "Set to http://localhost:8094 after starting", required: true },
      { key: "ANOMALY_THRESHOLD", description: "Heartbeat anomaly threshold in seconds (default: 300)", required: false },
    ],
  },
  {
    name: "Fraud Scoring",
    key: "fraud-scoring",
    language: "python",
    port: 8083,
    envVar: "FRAUD_SCORING_URL",
    description: "Real-time transaction risk scoring",
    startCmd: "cd paygate-middleware/python/fraud_scoring && uvicorn fraud_service:app --port 8083",
    dockerImage: "paygate/fraud-scoring:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "FRAUD_SCORING_URL", description: "Set to http://localhost:8083 after starting", required: true },
      { key: "FRAUD_THRESHOLD", description: "Risk score threshold 0-100 (default: 70)", required: false },
    ],
  },
  {
    name: "USSD Gateway",
    key: "ussd-gateway",
    language: "go",
    port: 8080,
    envVar: "USSD_GATEWAY_URL",
    description: "USSD session management and balance queries",
    startCmd: "cd paygate-middleware && go run ./wiring",
    dockerImage: "paygate/ussd-gateway:latest",
    requiredEnvVars: [
      { key: "DATABASE_URL", description: "MySQL/TiDB connection string", required: true },
      { key: "USSD_GATEWAY_URL", description: "Set to http://localhost:8080 after starting", required: true },
      { key: "USSD_SERVICE_CODE", description: "USSD short code (e.g. *737#)", required: false },
    ],
  },
];

const LANG_COLORS: Record<string, string> = {
  rust: "bg-orange-100 text-orange-800 border-orange-200",
  python: "bg-blue-100 text-blue-800 border-blue-200",
  go: "bg-cyan-100 text-cyan-800 border-cyan-200",
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopy}>
      {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <ClipboardCopy className="h-3 w-3" />}
      {label ?? "Copy"}
    </Button>
  );
}

function ServiceCard({ svc, status, isLoading }: { svc: ServiceInfo; status: "ok" | "down" | undefined; isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = status === "ok";

  return (
    <Card className={`border-l-4 transition-all ${isOnline ? "border-l-green-500" : "border-l-red-400"}`}>
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

        {isOnline && (
          <div className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            High-performance mode active — DB fallback disabled
          </div>
        )}

        {!isOnline && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Start command:
                </p>
                <CopyButton text={svc.startCmd} />
              </div>
              <code className="block text-xs bg-muted p-2 rounded font-mono break-all select-all">
                {svc.startCmd}
              </code>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Then set <code className="bg-muted px-1 rounded">{svc.envVar}=http://localhost:{svc.port}</code>
                </p>
                <CopyButton text={`${svc.envVar}=http://localhost:${svc.port}`} label="Copy env" />
              </div>
            </div>
          </>
        )}

        {/* Expandable env var checklist */}
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
          onClick={() => setExpanded((v: any) => !v)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Environment variables ({svc.requiredEnvVars.filter((e: any) => e.required).length} required)
        </button>

        {expanded && (
          <div className="space-y-1.5 mt-1">
            {svc.requiredEnvVars.map((env) => (
              <div key={env.key} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 shrink-0 ${env.required ? "text-red-500" : "text-muted-foreground"}`}>
                  {env.required ? "●" : "○"}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="bg-muted px-1 rounded font-mono">{env.key}</code>
                  <span className="ml-1 text-muted-foreground">{env.description}</span>
                </div>
                {env.required && <Badge variant="outline" className="text-xs h-4 px-1">required</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const DOCKER_COMPOSE = `version: "3.9"
services:
  inventory-engine:
    image: paygate/inventory-engine:latest
    ports: ["8091:8091"]
    environment:
      DATABASE_URL: \${DATABASE_URL}
  loyalty-ledger:
    image: paygate/loyalty-ledger:latest
    ports: ["8092:8092"]
    environment:
      DATABASE_URL: \${DATABASE_URL}
  payroll-service:
    image: paygate/payroll-service:latest
    ports: ["8093:8093"]
    environment:
      DATABASE_URL: \${DATABASE_URL}
  kiosk-health:
    image: paygate/kiosk-health:latest
    ports: ["8094:8094"]
    environment:
      DATABASE_URL: \${DATABASE_URL}
  fraud-scoring:
    image: paygate/fraud-scoring:latest
    ports: ["8083:8083"]
    environment:
      DATABASE_URL: \${DATABASE_URL}
  ussd-gateway:
    image: paygate/ussd-gateway:latest
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: \${DATABASE_URL}`;

export default function MicroserviceHealth() {
  const microserviceInterval = useAdaptiveInterval(30000);
  const [showCompose, setShowCompose] = useState(false);
  const { data, isLoading, isError, refetch } = trpc.agentBanking.microserviceStatus.useQuery(undefined, {
    refetchInterval: microserviceInterval,
    staleTime: 30_000,
  });

  const onlineCount = data ? Object.values(data).filter((v: any) => v === "ok").length : 0;
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
          aria-label="Refresh" onClick={() => refetch()}
          disabled={isLoading}
        ><RefreshCw/>
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

      {/* All offline banner */}
      {!isLoading && onlineCount === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">All microservices offline</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  The platform is running in DB-only fallback mode. Payments, loyalty, and inventory features
                  still work but without the performance benefits of the microservices. Start the services
                  using the commands below, then set the corresponding environment variables in Settings → Secrets.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {SERVICES.map((svc) => (
          <ServiceCard
            key={svc.key}
            svc={svc}
            status={data?.[svc.key] as "ok" | "down" | undefined}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Docker Compose section */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Docker Compose template</p>
                <p className="text-xs text-muted-foreground">
                  Start all services with a single <code className="bg-muted px-1 rounded">docker compose up -d</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={DOCKER_COMPOSE} label="Copy YAML" />
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCompose((v: any) => !v)}>
                {showCompose ? "Hide" : "Show"}
                {showCompose ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
              </Button>
            </div>
          </div>
          {showCompose && (
            <pre className="mt-3 text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto font-mono whitespace-pre">
              {DOCKER_COMPOSE}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Go-Bridge Production Config */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <Activity className="h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Go Middleware Bridge — Required Env Vars</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set these in <strong>Settings → Secrets</strong> to enable NIBSS NIP, Temporal workflows, and settlement processing.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {([
              { key: 'MIDDLEWARE_BRIDGE_URL', example: 'http://go-bridge:8080', desc: 'Go bridge base URL (internal Kubernetes service or Docker host)' },
              { key: 'MIDDLEWARE_INTERNAL_KEY', example: 'your-shared-secret', desc: 'Shared HMAC secret for bridge-to-portal auth' },
              { key: 'PORTAL_TRPC_URL', example: 'http://portal:3000/api/trpc', desc: 'Portal tRPC URL used by reconciler CronJobs to push alerts' },
            ] as { key: string; example: string; desc: string }[]).map(({ key, example, desc }) => (
              <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex-1 min-w-0">
                  <code className="text-xs font-mono font-semibold text-foreground">{key}</code>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">e.g. <code className="bg-background px-1 rounded">{example}</code></p>
                </div>
                <CopyButton text={`${key}=${example}`} label="Copy" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ENV docs link */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Code2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Full startup documentation</p>
              <p className="text-xs text-muted-foreground">
                See <code className="bg-muted px-1 rounded">ENV_DOCS.md</code> in the project root for complete
                environment variable reference and Docker Compose templates for all services.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
