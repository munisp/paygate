import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Split, Plus, Trash2, RefreshCw, CheckCircle } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

type SplitEntry = { recipientId: string; recipientType: "merchant" | "account" | "platform"; splitType: "percentage" | "fixed_kobo"; value: number; description: string };

export default function SplitPayments() {
  const [ruleName, setRuleName] = useState("");
  const [splits, setSplits] = useState<SplitEntry[]>([
    { recipientId: "", recipientType: "merchant", splitType: "percentage", value: 0, description: "" },
  ]);

  const { data: rules, isLoading, refetch } = trpc.tier1to5.splitPayments.getSplitRules.useQuery();

  const createMutation = trpc.tier1to5.splitPayments.createSplitRule.useMutation({
    onSuccess: () => {
      toast.success("Split rule created successfully.");
      setRuleName("");
      setSplits([{ recipientId: "", recipientType: "merchant", splitType: "percentage", value: 0, description: "" }]);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const executeMutation = trpc.tier1to5.splitPayments.executeSplitPayment.useMutation({
    onSuccess: () => { toast.success("Split payment executed."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const addSplit = () => setSplits(s => [...s, { recipientId: "", recipientType: "merchant", splitType: "percentage", value: 0, description: "" }]);
  const removeSplit = (i: number) => setSplits(s => s.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, field: keyof SplitEntry, value: any) =>
    setSplits(s => s.map((sp, idx) => idx === i ? { ...sp, [field]: value } : sp));

  const totalPct = splits.filter(s => s.splitType === "percentage").reduce((acc, s) => acc + (s.value || 0), 0);

  if (!isLoading && !rules) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Split Payments</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure multi-party settlement rules for marketplace payments</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Create Rule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Split className="w-5 h-5 text-primary" />
              Create Split Rule
            </CardTitle>
            <CardDescription>Define how payments are automatically split across multiple recipients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Rule Name</Label>
              <Input placeholder="e.g. Marketplace 80/20 Split" value={ruleName} onChange={e => setRuleName(e.target.value)} className="mt-1" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Recipients</Label>
                {totalPct > 0 && (
                  <Badge variant={totalPct === 100 ? "default" : "destructive"}>
                    {totalPct}% allocated {totalPct === 100 ? <CheckCircle className="w-3 h-3 ml-1 inline" /> : ""}
                  </Badge>
                )}
              </div>
              {splits.map((sp, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/30 rounded-lg">
                  <div className="col-span-3">
                    <Label className="text-xs">Recipient ID</Label>
                    <Input placeholder="mch_xxx" value={sp.recipientId} onChange={e => updateSplit(i, "recipientId", e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Type</Label>
                    <Select value={sp.recipientType} onValueChange={v => updateSplit(i, "recipientType", v)}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merchant">Merchant</SelectItem>
                        <SelectItem value="account">Account</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Split Type</Label>
                    <Select value={sp.splitType} onValueChange={v => updateSplit(i, "splitType", v as any)}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed_kobo">Fixed (₦)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">{sp.splitType === "percentage" ? "%" : "Amount (₦)"}</Label>
                    <Input type="number" placeholder="0" value={sp.value || ""} onChange={e => updateSplit(i, "value", parseFloat(e.target.value) || 0)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Input placeholder="Platform fee" value={sp.description} onChange={e => updateSplit(i, "description", e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => removeSplit(i)} disabled={splits.length === 1} className="h-8 w-8 p-0">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSplit}>
                <Plus className="w-4 h-4 mr-2" /> Add Recipient
              </Button>
            </div>

            <Button
              onClick={() => createMutation.mutate({ ruleName, splits, triggerEvents: ['payment.completed'] })}
              disabled={createMutation.isPending || !ruleName || splits.some(s => !s.recipientId)}
            >
              {createMutation.isPending ? "Creating..." : "Create Split Rule"}
            </Button>
          </CardContent>
        </Card>

        {/* Existing Rules */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Existing Split Rules</h2>
          {isLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Card key={i} className="animate-pulse h-20" />)}</div>
          ) : !rules?.length ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Split className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No split rules yet. Create one above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule: any) => (
                <Card key={rule.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{rule.ruleName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {rule.splits?.length ?? 0} recipients · Created {new Date(rule.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.isActive ? "default" : "secondary"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => executeMutation.mutate({ ruleId: rule.id, totalAmountKobo: 100000, reference: `test_${Date.now()}` })} disabled={executeMutation.isPending}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
