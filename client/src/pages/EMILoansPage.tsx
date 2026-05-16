// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CreditCard, Plus, Calculator } from "lucide-react";

export default function EMILoansPage() {
  const [showApply, setShowApply] = useState(false);
  const [form, setForm] = useState({ principalKobo: 5_000_000, tenureMonths: 12, purpose: "" });
  const [calcResult, setCalcResult] = useState<{ emi: number; totalPayable: number; totalInterest: number } | null>(null);

  const { data, isLoading, refetch } = trpc.consumerFinancial.emiLoans.useQuery();

  const calcEmi = trpc.emi.calculate.useQuery(
    { principalKobo: form.principalKobo, annualRatePct: 24, tenureMonths: form.tenureMonths },
    { enabled: false }
  , { staleTime: 30_000 });

  const applyLoan = trpc.consumerFinancial.applyEmiLoan.useMutation({
    onSuccess: () => { toast.success("EMI loan application submitted!"); refetch(); setShowApply(false); },
    onError: (e) => toast.error(e.message),
  });

  const handleCalculate = async () => {
    const result = await calcEmi.refetch();
    if (result.data) setCalcResult(result.data);
  };

  const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

  const statusBadge = (s: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      active: "default",
      completed: "secondary",
      defaulted: "destructive",
      pending: "outline",
    };
    return <Badge variant={variants[s] ?? "secondary"}>{s}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            EMI Loans
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Equated Monthly Installment loans — borrow now, pay in fixed monthly instalments
          </p>
        </div>
        <Button onClick={() => setShowApply(true)}>
          <Plus className="w-4 h-4 mr-2" /> Apply for Loan
        </Button>
      </div>

      {/* Active Loans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 text-center py-8 text-muted-foreground">Loading loans...</div>
        ) : (data?.loans ?? []).length === 0 ? (
          <Card className="col-span-3">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No EMI loans yet. Apply for your first loan above.
            </CardContent>
          </Card>
        ) : (
          (data?.loans ?? []).map((loan: any) => (
            <Card key={loan.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{formatNaira(loan.principal_kobo)}</CardTitle>
                  {statusBadge(loan.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Monthly EMI</div>
                    <div className="font-semibold">{formatNaira(loan.emi_kobo)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Tenure</div>
                    <div className="font-semibold">{loan.tenure_months} months</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Rate</div>
                    <div className="font-semibold">{loan.annual_rate_pct}% p.a.</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Purpose</div>
                    <div className="font-semibold truncate">{loan.purpose}</div>
                  </div>
                </div>
                {loan.status === "active" && (
                  <div className="bg-muted rounded-lg p-2 text-xs text-center text-muted-foreground">
                    Next payment due: {loan.next_payment_date ? new Date(loan.next_payment_date).toLocaleDateString() : "—"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Apply Dialog */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for EMI Loan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loan Amount (₦)</Label>
              <Input
                type="number"
                min={10000}
                step={10000}
                value={form.principalKobo / 100}
                onChange={e => setForm(f => ({ ...f, principalKobo: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
                placeholder="50,000"
              />
              <p className="text-xs text-muted-foreground">Minimum ₦10,000 — Maximum ₦5,000,000</p>
            </div>

            <div className="space-y-2">
              <Label>Tenure</Label>
              <Select value={String(form.tenureMonths)} onValueChange={v => setForm(f => ({ ...f, tenureMonths: parseInt(v) }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12, 18, 24, 36, 48, 60].map(m => (
                    <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Purpose</Label>
              <Input
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                placeholder="e.g. Business equipment, Medical expenses..."
              />
            </div>

            <Button variant="outline" className="w-full" onClick={handleCalculate}>
              <Calculator className="w-4 h-4 mr-2" /> Calculate EMI
            </Button>

            {calcResult && (
              <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly EMI</span>
                  <span className="font-bold text-primary">{formatNaira(calcResult.emi)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Payable</span>
                  <span className="font-semibold">{formatNaira(calcResult.totalPayable)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Interest</span>
                  <span className="text-orange-600">{formatNaira(calcResult.totalInterest)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Interest rate: 24% p.a.</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApply(false)}>Cancel</Button>
            <Button
              disabled={!form.purpose || form.principalKobo < 1_000_000 || applyLoan.isPending}
              onClick={() => applyLoan.mutate({ principalKobo: form.principalKobo, tenureMonths: form.tenureMonths, purpose: form.purpose })}
            >
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
