import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, PiggyBank, Plus, Clock } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function ConsumerPension() {
  const [contributeDialog, setContributeDialog] = useState(false);
  const [amount, setAmount] = useState("");
  const [contribType, setContribType] = useState<"mandatory" | "voluntary">("voluntary");

  const { data: account, refetch: refetchAccount } = trpc.consumerFinancial.pension.getBalance.useQuery();
  const { data: contributions, refetch: refetchContrib } = trpc.consumerFinancial.pension.getContributions.useQuery();

  const contributeMutation = trpc.consumerFinancial.pension.contribute.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Pension contribution of ${formatKobo(d.amountKobo ?? 0)} recorded`);
      setContributeDialog(false);
      setAmount("");
      refetchAccount();
      refetchContrib();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const acc = (account as any)?.balance;
  const contribs = (contributions as any)?.contributions ?? [];

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-500" /> Pension Account
      </h1>

      {/* Account Summary */}
      {acc ? (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">RSA PIN</p>
                <p className="text-lg font-bold text-blue-900">{acc.rsaPin}</p>
              </div>
              <Badge variant={acc.status === "active" ? "default" : "secondary"}>{acc.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-blue-600">Total Balance</p>
                <p className="text-xl font-bold text-blue-900">{formatKobo(acc.balanceKobo ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600">PFA</p>
                <p className="text-sm font-medium text-blue-800">{acc.pfaName ?? "ARM Pension"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No pension account found. Contact your employer to set up an RSA.</p>
          </CardContent>
        </Card>
      )}

      {/* Contribute Button */}
      <Button className="w-full" onClick={() => setContributeDialog(true)}>
        <Plus className="w-4 h-4 mr-2" /> Make Voluntary Contribution
      </Button>

      {/* Contribution History */}
      {contribs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Contribution History
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {contribs.slice(0, 10).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{c.type} contribution</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatKobo(c.amountKobo ?? 0)}</p>
                    <Badge variant={c.status === "processed" ? "default" : "secondary"} className="text-xs">
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contribute Dialog */}
      <Dialog open={contributeDialog} onOpenChange={setContributeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Make Pension Contribution</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["voluntary", "mandatory"] as const).map((t) => (
                <Button
                  key={t}
                  variant={contribType === t ? "default" : "outline"}
                  size="sm"
                  className="capitalize"
                  onClick={() => setContribType(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input
                type="number"
                placeholder="e.g. 10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Voluntary contributions are tax-deductible up to 1/3 of annual income.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContributeDialog(false)}>Cancel</Button>
            <Button
              disabled={!amount || Number(amount) <= 0 || contributeMutation.isPending}
              onClick={() => contributeMutation.mutate({ amountKobo: Math.round(Number(amount) * 100) })}
            >
              {contributeMutation.isPending ? "Processing..." : "Contribute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
