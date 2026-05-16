import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Shield, AlertTriangle, RefreshCw, ChevronRight, TrendingUp } from "lucide-react";
import { format } from "date-fns";

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const RISK_BAR_COLORS: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

export default function AdminMerchantRisk() {
  const [riskFilter, setRiskFilter] = useState<"all" | "low" | "medium" | "high" | "critical">("all");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [recalcId, setRecalcId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.wave24.merchantRisk.list.useQuery({
    riskLevel: riskFilter,
    limit: 50,
    offset: 0,
  }, { staleTime: 30_000 });

  const recalcMutation = trpc.wave24.merchantRisk.recalculate.useMutation({
    onSuccess: (result) => {
      toast.success(`Risk score recalculated: ${result.overallScore}/100 (${result.riskLevel})`);
      refetch();
      setRecalcId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const criticalCount = items.filter(i => i.riskLevel === "critical").length;
  const highCount = items.filter(i => i.riskLevel === "high").length;
  const avgScore = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.overallScore, 0) / items.length) : 0;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6" /> Merchant Risk Scoring</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time risk assessment across all merchants</p>
          </div>
          <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">Total Assessed</div>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-xs text-muted-foreground">Critical Risk</div>
            </CardContent>
          </Card>
          <Card className="border-orange-200">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">{highCount}</div>
              <div className="text-xs text-muted-foreground">High Risk</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{avgScore}</div>
              <div className="text-xs text-muted-foreground">Avg Risk Score</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by risk level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Risk Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading risk scores...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No risk scores found. Run recalculation from the Merchant Management page.</p>
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">Merchant ID</th>
                    <th className="text-left p-3 font-medium">Overall Score</th>
                    <th className="text-left p-3 font-medium">Risk Level</th>
                    <th className="text-left p-3 font-medium">Fraud</th>
                    <th className="text-left p-3 font-medium">Chargeback</th>
                    <th className="text-left p-3 font-medium">KYC</th>
                    <th className="text-left p-3 font-medium">Last Calculated</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-xs">{item.merchantId.slice(0, 16)}...</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${RISK_BAR_COLORS[item.riskLevel] ?? "bg-gray-400"}`}
                                style={{ width: `${item.overallScore}%` }}
                              />
                            </div>
                          </div>
                          <span className="font-semibold">{item.overallScore}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${RISK_COLORS[item.riskLevel] ?? ""}`}>
                          {item.riskLevel.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-xs">{item.fraudScore ?? 0}</td>
                      <td className="p-3 text-xs">{item.chargebackScore ?? 0}</td>
                      <td className="p-3 text-xs">{item.kycScore ?? 0}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.calculatedAt ? format(new Date(item.calculatedAt), "MMM d, HH:mm") : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => setSelectedMerchantId(item.merchantId)}>
                            <ChevronRight className="w-3.5 h-3.5 mr-1" />Details
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs"
                            aria-label="Refresh" onClick={() => { setRecalcId(item.merchantId); recalcMutation.mutate({ merchantId: item.merchantId }); }}
                            disabled={recalcMutation.isPending && recalcId === item.merchantId}><RefreshCw/>
                            Recalc
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      {selectedMerchantId && (
        <MerchantRiskDetail merchantId={selectedMerchantId} onClose={() => setSelectedMerchantId(null)} />
      )}
    </AdminLayout>
  );
}

function MerchantRiskDetail({ merchantId, onClose }: { merchantId: string; onClose: () => void }) {
  const { data } = trpc.wave24.merchantRisk.getScore.useQuery({ merchantId }, { staleTime: 30_000 });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />Risk Score Detail
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-center text-muted-foreground py-8">No risk score available</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
              <div>
                <div className="text-3xl font-bold">{data.overallScore}<span className="text-lg text-muted-foreground">/100</span></div>
                <div className="text-sm text-muted-foreground">Overall Risk Score</div>
              </div>
              <span className={`text-sm px-3 py-1 rounded-full font-medium border ${RISK_COLORS[data.riskLevel] ?? ""}`}>
                {data.riskLevel?.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2">
              {[
                { label: "Fraud Score", value: data.fraudScore ?? 0, max: 30 },
                { label: "Chargeback Score", value: data.chargebackScore ?? 0, max: 25 },
                { label: "KYC Score", value: data.kycScore ?? 0, max: 20 },
                { label: "Transaction Score", value: data.transactionScore ?? 0, max: 15 },
                { label: "Velocity Score", value: data.velocityScore ?? 0, max: 10 },
              ].map(s => (
                <div key={s.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{s.label}</span>
                    <span className="font-medium">{s.value}/{s.max}</span>
                  </div>
                  <Progress value={(s.value / s.max) * 100} className="h-1.5" />
                </div>
              ))}
            </div>

            {data.factors && (
              <div>
                <div className="text-xs font-medium mb-2 text-muted-foreground">Risk Factors</div>
                <div className="space-y-1">
                  {(JSON.parse(data.factors as string) as string[]).map((f: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recommendation && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-xs font-medium text-blue-700 mb-1">Recommendation</div>
                <div className="text-xs text-blue-600">{data.recommendation}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
