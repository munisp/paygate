// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, Save, RefreshCw, Info } from "lucide-react";

const PLANS = [
  { id: "starter", label: "Starter", defaultThreshold: 0, description: "GNN disabled — rule-based only" },
  { id: "growth", label: "Growth", defaultThreshold: 10_000_000, description: "GNN triggers at ₦100,000+" },
  { id: "enterprise", label: "Enterprise", defaultThreshold: 5_000_000, description: "GNN triggers at ₦50,000+" },
];

export default function GNNThresholdPage() {
  const { data, isLoading, refetch } = trpc.gnnThreshold.list.useQuery();
  const [editing, setEditing] = useState<Record<string, number>>({});

  const update = trpc.gnnThreshold.update.useMutation({
    onSuccess: () => { toast.success("GNN threshold updated"); refetch(); setEditing({}); },
    onError: (e) => toast.error(e.message),
  });

  const thresholds = data?.thresholds ?? [];

  const getThreshold = (planId: string) => {
    const found = thresholds.find(t => t.planId === planId);
    return found?.gnnThresholdKobo ?? PLANS.find(p => p.id === planId)?.defaultThreshold ?? 0;
  };

  const formatNaira = (kobo: number) => {
    if (kobo === 0) return "Disabled";
    return `₦${(kobo / 100).toLocaleString()}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            GNN Fraud Threshold by Plan
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure the transaction value threshold above which the GraphSAGE GNN model is invoked for fraud scoring
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <strong>How it works:</strong> For each transaction, the rule-based fraud scorer runs first. If the transaction amount exceeds the plan's GNN threshold, the GraphSAGE model is also invoked and scores are merged (40% rule-based + 60% GNN). Set threshold to 0 to disable GNN for a plan.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(plan => {
          const currentThreshold = editing[plan.id] !== undefined ? editing[plan.id] : getThreshold(plan.id);
          const isDirty = editing[plan.id] !== undefined;

          return (
            <Card key={plan.id} className={isDirty ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.label} Plan</span>
                  <Badge variant={plan.id === "enterprise" ? "default" : plan.id === "growth" ? "secondary" : "outline"}>
                    {plan.id}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{plan.description}</p>

                <div className="space-y-2">
                  <Label>GNN Threshold (kobo)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={100000}
                    value={currentThreshold}
                    onChange={e => setEditing(prev => ({ ...prev, [plan.id]: parseInt(e.target.value) || 0 }))}
                    placeholder="0 = disabled"
                  />
                  <p className="text-xs text-muted-foreground">
                    = {formatNaira(currentThreshold)}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Current live value:</div>
                  <div className="font-semibold text-sm">{formatNaira(getThreshold(plan.id))}</div>
                </div>

                <Button
                  className="w-full"
                  disabled={!isDirty || update.isPending}
                  onClick={() => update.mutate({ planId: plan.id, gnnThresholdKobo: currentThreshold })}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Threshold
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Current Config Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Plan</th>
                  <th className="text-left py-2">Threshold (kobo)</th>
                  <th className="text-left py-2">Threshold (₦)</th>
                  <th className="text-left py-2">GNN Active</th>
                  <th className="text-left py-2">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map(plan => {
                  const t = thresholds.find(th => th.planId === plan.id);
                  const threshold = t?.gnnThresholdKobo ?? PLANS.find(p => p.id === plan.id)?.defaultThreshold ?? 0;
                  return (
                    <tr key={plan.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{plan.label}</td>
                      <td className="py-2 font-mono">{threshold.toLocaleString()}</td>
                      <td className="py-2">{formatNaira(threshold)}</td>
                      <td className="py-2">
                        <Badge variant={threshold > 0 ? "default" : "secondary"}>
                          {threshold > 0 ? "Enabled" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {t?.updatedAt ? new Date(t.updatedAt).toLocaleString() : "Default"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
