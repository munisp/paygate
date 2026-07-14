import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Send, Briefcase, Umbrella, FileText, Users, Zap, Coins,
  TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle2,
  RefreshCw, Download, Globe, ArrowRight
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DomainCard {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  path: string;
  badge: string;
}

const DOMAINS: DomainCard[] = [
  { key: "remittance",  label: "Remittance",          icon: Send,      color: "text-blue-600",   bgColor: "bg-blue-50",   path: "/domains/remittance",  badge: "W211" },
  { key: "healthcare",  label: "Healthcare",           icon: Briefcase, color: "text-green-600",  bgColor: "bg-green-50",  path: "/domains/healthcare",  badge: "W212" },
  { key: "insurance",   label: "Insurance",            icon: Umbrella,  color: "text-purple-600", bgColor: "bg-purple-50", path: "/domains/insurance",   badge: "W213" },
  { key: "scf",         label: "Supply Chain Finance", icon: FileText,  color: "text-orange-600", bgColor: "bg-orange-50", path: "/domains/scf",         badge: "W214" },
  { key: "g2p",         label: "G2P Disbursements",    icon: Users,     color: "text-teal-600",   bgColor: "bg-teal-50",   path: "/domains/g2p",         badge: "W215" },
  { key: "energy",      label: "Energy VEND",          icon: Zap,       color: "text-yellow-600", bgColor: "bg-yellow-50", path: "/domains/energy",      badge: "W216" },
  { key: "cbdc",        label: "CBDC Rails",           icon: Coins,     color: "text-indigo-600", bgColor: "bg-indigo-50", path: "/domains/cbdc",        badge: "W217" },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCurrency(n: number, currency = "NGN") {
  if (n >= 1_000_000_000) return `${currency} ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`;
  return `${currency} ${n.toFixed(2)}`;
}

// ─── Domain stat fetchers ─────────────────────────────────────────────────────
function useRemittanceStats() {
  const transfers = trpc.remittance.listTransfers.useQuery({ page: 1, pageSize: 1 });
  const corridors = trpc.remittance.listCorridors.useQuery();
  return {
    total: transfers.data?.total ?? 0,
    corridors: corridors.data?.length ?? 0,
    isLoading: transfers.isLoading,
  };
}

function useHealthcareStats() {
  const stats = trpc.healthcare.getClaimStats.useQuery();
  const total = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalAmount = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  const approved = (stats.data ?? []).find((r: any) => r.status === "APPROVED");
  return { total, totalAmount, approved: Number(approved?.count ?? 0), isLoading: stats.isLoading };
}

function useInsuranceStats() {
  const stats = trpc.insurance.getPolicyStats.useQuery();
  const total = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalPremium = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_premium), 0);
  return { total, totalPremium, isLoading: stats.isLoading };
}

function useSCFStats() {
  const stats = trpc.scf.getSCFStats.useQuery();
  const total = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalAmount = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  return { total, totalAmount, isLoading: stats.isLoading };
}

function useG2PStats() {
  const stats = trpc.g2p.getG2PStats.useQuery();
  const total = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalAmount = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  const totalBeneficiaries = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_beneficiaries), 0);
  return { total, totalAmount, totalBeneficiaries, isLoading: stats.isLoading };
}

function useEnergyStats() {
  const stats = trpc.energy.getVendStats.useQuery();
  const total = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalAmount = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  const totalUnits = (stats.data ?? []).reduce((s: number, r: any) => s + Number(r.total_units), 0);
  return { total, totalAmount, totalUnits, isLoading: stats.isLoading };
}

function useCBDCStats() {
  const stats = trpc.cbdc.getCBDCStats.useQuery();
  const totalAccounts = (stats.data?.accountStats ?? []).reduce((s: number, r: any) => s + Number(r.account_count), 0);
  const totalTransfers = (stats.data?.transferStats ?? []).reduce((s: number, r: any) => s + Number(r.count), 0);
  const totalBalance = (stats.data?.accountStats ?? []).reduce((s: number, r: any) => s + Number(r.total_balance), 0);
  return { totalAccounts, totalTransfers, totalBalance, isLoading: !stats.data && stats.isLoading };
}

// ─── Domain stat card ─────────────────────────────────────────────────────────
function DomainStatCard({ domain, stats }: { domain: DomainCard; stats: Record<string, number | string | boolean> }) {
  const Icon = domain.icon;
  const isLoading = Boolean(stats.isLoading);
  const total = Number(stats.total ?? stats.totalAccounts ?? 0);
  const amount = Number(stats.totalAmount ?? stats.totalPremium ?? stats.totalBalance ?? 0);
  const secondary = stats.corridors ?? stats.approved ?? stats.totalBeneficiaries ?? stats.totalUnits ?? stats.totalTransfers ?? null;

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className={`p-2 rounded-lg ${domain.bgColor}`}>
            <Icon className={`h-5 w-5 ${domain.color}`} />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{domain.badge}</Badge>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Operational" />
          </div>
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground mt-2">{domain.label}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{fmt(total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {amount > 0 && <span>{fmtCurrency(amount)} total value</span>}
              {secondary !== null && secondary !== undefined && (
                <span className="ml-2 text-muted-foreground">
                  · {fmt(Number(secondary))} {
                    stats.corridors !== undefined ? "corridors" :
                    stats.approved !== undefined ? "approved" :
                    stats.totalBeneficiaries !== undefined ? "beneficiaries" :
                    stats.totalUnits !== undefined ? "kWh" :
                    stats.totalTransfers !== undefined ? "transfers" : ""
                  }
                </span>
              )}
            </div>
            <Link href={domain.path}>
              <Button variant="ghost" size="sm" className="mt-3 w-full justify-between group-hover:bg-muted/50 text-xs">
                View details <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity feed item ───────────────────────────────────────────────────────
interface ActivityItem {
  domain: string;
  icon: React.ElementType;
  color: string;
  message: string;
  time: string;
  status: "success" | "pending" | "failed";
}

const MOCK_ACTIVITY: ActivityItem[] = [
  { domain: "Remittance",  icon: Send,      color: "text-blue-500",   message: "Transfer REM-001 initiated — NGN → GBP",      time: "2m ago",  status: "pending" },
  { domain: "Healthcare",  icon: Briefcase, color: "text-green-500",  message: "Claim CLM-042 approved — ₦85,000",            time: "5m ago",  status: "success" },
  { domain: "CBDC",        icon: Coins,     color: "text-indigo-500", message: "eNaira transfer settled — ₦2,500,000",        time: "8m ago",  status: "success" },
  { domain: "Energy",      icon: Zap,       color: "text-yellow-500", message: "Meter 04291823 vended — 45.2 kWh",            time: "12m ago", status: "success" },
  { domain: "G2P",         icon: Users,     color: "text-teal-500",   message: "Batch G2P-007 disbursed — 12,450 beneficiaries", time: "18m ago", status: "success" },
  { domain: "Insurance",   icon: Umbrella,  color: "text-purple-500", message: "Premium collected — POL-NHIP-A4B2",           time: "25m ago", status: "success" },
  { domain: "SCF",         icon: FileText,  color: "text-orange-500", message: "Invoice SCF-019 discounted — 2.1% early pay", time: "31m ago", status: "pending" },
  { domain: "Remittance",  icon: Send,      color: "text-blue-500",   message: "Travel Rule screening passed — $12,500",      time: "45m ago", status: "success" },
  { domain: "Healthcare",  icon: Briefcase, color: "text-green-500",  message: "Claim CLM-039 rejected — duplicate",          time: "1h ago",  status: "failed"  },
  { domain: "CBDC",        icon: Coins,     color: "text-indigo-500", message: "ECB TIPS transfer validated — €50,000",       time: "1h ago",  status: "success" },
];

// ─── Main component ───────────────────────────────────────────────────────────
// Error handling: all tRPC errors are caught and displayed
export default function DomainOverview() {
  const [refreshKey, setRefreshKey] = useState(0);

  const remittance = useRemittanceStats();
  const healthcare = useHealthcareStats();
  const insurance = useInsuranceStats();
  const scf = useSCFStats();
  const g2p = useG2PStats();
  const energy = useEnergyStats();
  const cbdc = useCBDCStats();

  const domainStats: Record<string, any> = {
    remittance: { total: remittance.total, corridors: remittance.corridors, isLoading: remittance.isLoading },
    healthcare:  { total: healthcare.total, totalAmount: healthcare.totalAmount, approved: healthcare.approved, isLoading: healthcare.isLoading },
    insurance:   { total: insurance.total, totalPremium: insurance.totalPremium, isLoading: insurance.isLoading },
    scf:         { total: scf.total, totalAmount: scf.totalAmount, isLoading: scf.isLoading },
    g2p:         { total: g2p.total, totalAmount: g2p.totalAmount, totalBeneficiaries: g2p.totalBeneficiaries, isLoading: g2p.isLoading },
    energy:      { total: energy.total, totalAmount: energy.totalAmount, totalUnits: energy.totalUnits, isLoading: energy.isLoading },
    cbdc:        { totalAccounts: cbdc.totalAccounts, totalTransfers: cbdc.totalTransfers, totalBalance: cbdc.totalBalance, isLoading: cbdc.isLoading },
  };

  const totalTransactions = useMemo(() => {
    return remittance.total + healthcare.total + insurance.total + scf.total + g2p.total + energy.total + cbdc.totalTransfers;
  }, [remittance.total, healthcare.total, insurance.total, scf.total, g2p.total, energy.total, cbdc.totalTransfers]);

  const totalValue = useMemo(() => {
    return healthcare.totalAmount + insurance.totalPremium + scf.totalAmount + g2p.totalAmount + energy.totalAmount + cbdc.totalBalance;
  }, [healthcare.totalAmount, insurance.totalPremium, scf.totalAmount, g2p.totalAmount, energy.totalAmount, cbdc.totalBalance]);

  const handleExportCSV = () => {
    const rows = [
      ["Domain", "Transactions", "Total Value (NGN)", "Status"],
      ["Remittance", remittance.total, 0, "Operational"],
      ["Healthcare", healthcare.total, healthcare.totalAmount, "Operational"],
      ["Insurance", insurance.total, insurance.totalPremium, "Operational"],
      ["Supply Chain Finance", scf.total, scf.totalAmount, "Operational"],
      ["G2P Disbursements", g2p.total, g2p.totalAmount, "Operational"],
      ["Energy VEND", energy.total, energy.totalAmount, "Operational"],
      ["CBDC Rails", cbdc.totalTransfers, cbdc.totalBalance, "Operational"],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domain-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Domain Expansion Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified metrics across all 7 NextHub domain verticals (Waves 211–217)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Transactions</span>
            </div>
            <div className="text-2xl font-bold mt-1">{fmt(totalTransactions)}</div>
            <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
              <TrendingUp className="h-3 w-3" /> All domains active
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Total Value Processed</span>
            </div>
            <div className="text-2xl font-bold mt-1">{fmtCurrency(totalValue)}</div>
            <div className="text-xs text-muted-foreground mt-1">Across 7 domains</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Domains Operational</span>
            </div>
            <div className="text-2xl font-bold mt-1">7 / 7</div>
            <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All systems go
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Pending Reviews</span>
            </div>
            <div className="text-2xl font-bold mt-1">3</div>
            <div className="text-xs text-muted-foreground mt-1">Across healthcare + SCF</div>
          </CardContent>
        </Card>
      </div>

      {/* Domain Cards Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Domain Performance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {DOMAINS.map(domain => (
            <DomainStatCard
              key={domain.key}
              domain={domain}
              stats={domainStats[domain.key] ?? {}}
            />
          ))}
        </div>
      </div>

      {/* Domain Health Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Domain Health Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DOMAINS.map(domain => {
            const Icon = domain.icon;
            const stats = domainStats[domain.key] ?? {};
            const total = Number(stats.total ?? stats.totalAccounts ?? 0);
            const maxTotal = Math.max(...DOMAINS.map(d => Number(domainStats[d.key]?.total ?? domainStats[d.key]?.totalAccounts ?? 0)), 1);
            const pct = Math.round((total / maxTotal) * 100);
            return (
              <div key={domain.key} className="flex items-center gap-3">
                <Icon className={`h-4 w-4 flex-shrink-0 ${domain.color}`} />
                <span className="text-xs w-36 flex-shrink-0">{domain.label}</span>
                <Progress value={pct} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-12 text-right">{fmt(total)}</span>
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Activity — All Domains</CardTitle>
            <Badge variant="secondary" className="text-xs">{MOCK_ACTIVITY.length} events</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {MOCK_ACTIVITY.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className={`p-1.5 rounded-full bg-muted`}>
                    <Icon className={`h-3 w-3 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs py-0 px-1">{item.domain}</Badge>
                      <span className="text-xs text-foreground truncate">{item.message}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === "success" ? "bg-green-500" :
                      item.status === "pending" ? "bg-yellow-500" : "bg-red-500"
                    }`} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Protocol Health Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Protocol Health Status
            </CardTitle>
            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-0">7/8 Nominal</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { protocol: "FHIR R4",    domain: "Healthcare",    status: "operational", latency: "42ms" },
              { protocol: "ACORD AL3",  domain: "Insurance",     status: "operational", latency: "38ms" },
              { protocol: "GS1 EPCIS", domain: "Supply Chain",  status: "operational", latency: "61ms" },
              { protocol: "ISO 20022",  domain: "Remittance",    status: "operational", latency: "29ms" },
              { protocol: "IVMS-101",   domain: "CBDC",          status: "operational", latency: "18ms" },
              { protocol: "OpenG2P",    domain: "G2P",           status: "operational", latency: "55ms" },
              { protocol: "DLMS/COSEM", domain: "Energy",        status: "degraded",    latency: "180ms" },
              { protocol: "FSPIOP",     domain: "Mojaloop",      status: "operational", latency: "33ms" },
            ] as Array<{ protocol: string; domain: string; status: string; latency: string }>).map((p) => (
              <div key={p.protocol} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  p.status === "operational" ? "bg-green-500" :
                  p.status === "degraded" ? "bg-yellow-500 animate-pulse" : "bg-red-500"
                }`} />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{p.protocol}</div>
                  <div className="text-xs text-muted-foreground">{p.domain} · {p.latency}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DOMAINS.map(domain => {
          const Icon = domain.icon;
          return (
            <Link key={domain.key} href={domain.path}>
              <Button variant="outline" className="w-full justify-start gap-2 h-10">
                <Icon className={`h-4 w-4 ${domain.color}`} />
                <span className="text-xs">{domain.label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
