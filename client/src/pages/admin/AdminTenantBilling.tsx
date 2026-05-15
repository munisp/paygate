// @ts-nocheck
/**
 * AdminTenantBilling — Usage dashboard with quota bars, invoice history,
 * and billing management per tenant.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CreditCard,
  BarChart3,
  Search,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  Zap,
  Database,
} from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  enterprise: "bg-purple-100 text-purple-700",
};

const INVOICE_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  paid: { label: "Paid", color: "text-green-600", icon: <CheckCircle2 className="h-4 w-4" /> },
  pending: { label: "Pending", color: "text-yellow-600", icon: <Clock className="h-4 w-4" /> },
  overdue: { label: "Overdue", color: "text-red-600", icon: <AlertTriangle className="h-4 w-4" /> },
  void: { label: "Void", color: "text-gray-400", icon: <CheckCircle2 className="h-4 w-4" /> },
};

function QuotaBar({
  label,
  used,
  limit,
  icon,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  icon: React.ReactNode;
  unit: string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = pct >= 80;
  const isCritical = pct >= 95;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </div>
        <span className={`font-medium ${isCritical ? "text-red-600" : isWarning ? "text-amber-600" : ""}`}>
          {used.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <Progress
        value={pct}
        className={`h-2 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : ""}`}
      />
      {isCritical && (
        <div className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Quota nearly exhausted
        </div>
      )}
    </div>
  );
}

export default function AdminTenantBilling() {
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data: tenantsData, isLoading } = trpc.wave26.tenants.list.useQuery({ page: 1, pageSize: 50 });
  const { data: usageData } = trpc.wave26.usageMetering.getUsage.useQuery(
    { tenantId: selectedTenantId! },
    { enabled: !!selectedTenantId },
  );
  const { data: invoicesData } = trpc.wave26.usageMetering.getInvoices.useQuery(
    { tenantId: selectedTenantId! },
    { enabled: !!selectedTenantId },
  );

  const tenants = (tenantsData?.tenants ?? []).filter(
    (t: any) =>
      !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedTenant = tenants.find((t: any) => t.id === selectedTenantId);
  const usage = usageData?.usage;
  const limits = usageData?.limits;
  const invoices = invoicesData?.invoices ?? [];

  const formatCurrency = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Tenant Billing</h1>
          <p className="text-muted-foreground">Monitor usage, quotas, and invoices per tenant</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tenant Selector */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Select Tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {tenants.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  className={`w-full text-left p-3 rounded-lg hover:bg-muted transition-colors ${
                    selectedTenantId === t.id ? "bg-primary/10 border border-primary/30" : ""
                  }`}
                >
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-xs ${PLAN_COLORS[t.plan] ?? "bg-gray-100 text-gray-700"}`}>
                      {t.plan}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{t.slug}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Usage + Invoices */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedTenantId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Select a tenant to view billing details</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Usage Quotas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Current Period Usage
                    {selectedTenant && (
                      <Badge className={PLAN_COLORS[selectedTenant.plan] ?? ""}>
                        {selectedTenant.plan}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {usage && limits ? (
                    <>
                      <QuotaBar
                        label="API Calls"
                        used={usage.apiCalls ?? 0}
                        limit={limits.maxApiCalls ?? 10000}
                        icon={<Zap className="h-4 w-4" />}
                        unit="calls"
                      />
                      <QuotaBar
                        label="Transaction Volume"
                        used={Math.round((usage.txVolume ?? 0) / 100)}
                        limit={Math.round((limits.maxTxVolume ?? 10000000) / 100)}
                        icon={<CreditCard className="h-4 w-4" />}
                        unit="NGN"
                      />
                      <QuotaBar
                        label="Active Users"
                        used={usage.activeUsers ?? 0}
                        limit={limits.maxUsers ?? 100}
                        icon={<Users className="h-4 w-4" />}
                        unit="users"
                      />
                      <QuotaBar
                        label="Storage"
                        used={Math.round((usage.storageBytes ?? 0) / 1024 / 1024)}
                        limit={Math.round((limits.maxStorageBytes ?? 1073741824) / 1024 / 1024)}
                        icon={<Database className="h-4 w-4" />}
                        unit="MB"
                      />
                    </>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Loading usage data...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Invoice History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" /> Invoice History
                    </span>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      No invoices found for this tenant
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invoices.map((inv: any) => {
                        const cfg = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.pending;
                        return (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <div className={cfg.color}>{cfg.icon}</div>
                              <div>
                                <div className="font-medium text-sm">
                                  {inv.period ?? "Monthly Invoice"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {inv.createdAt
                                    ? new Date(inv.createdAt).toLocaleDateString()
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="font-bold">{formatCurrency(inv.amountCents ?? 0)}</div>
                                <Badge
                                  className={`text-xs ${
                                    inv.status === "paid"
                                      ? "bg-green-100 text-green-700"
                                      : inv.status === "overdue"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-yellow-100 text-yellow-700"
                                  }`}
                                >
                                  {cfg.label}
                                </Badge>
                              </div>
                              {inv.stripeInvoiceId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    toast.info(`Stripe Invoice: ${inv.stripeInvoiceId}`)
                                  }
                                >
                                  View
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
