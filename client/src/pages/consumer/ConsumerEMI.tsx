import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, Calculator, Clock, CheckCircle } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function ConsumerEMI() {
  const [calcDialog, setCalcDialog] = useState(false);
  const [applyDialog, setApplyDialog] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [tenure, setTenure] = useState("12");
  const [rate, setRate] = useState("18");
  const [purpose, setPurpose] = useState("");
  const [calcResult, setCalcResult] = useState<any>(null);

  const { data: loans, refetch } = trpc.consumerFinancial.emi.getLoans.useQuery();

  const calcMutation = trpc.consumerFinancial.emi.calculate.useMutation({
    onSuccess: (d: any) => {
      setCalcResult(d);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyMutation = trpc.consumerFinancial.emi.applyLoan.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Loan application ${d.loanId} submitted`);
      setApplyDialog(false);
      setPrincipal("");
      setPurpose("");
      setCalcResult(null);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // payEMI not yet in router — placeholder
  const payMutation = { mutate: (_: any) => toast.info('EMI payment feature coming soon'), isPending: false };

  const loanList = (loans as any[]) ?? [];

  const statusColor = (s: string) => {
    if (s === "active") return "default";
    if (s === "closed") return "secondary";
    if (s === "defaulted") return "destructive";
    return "outline";
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-purple-500" /> EMI Loans
      </h1>

      {/* Actions */}
      <div className="flex gap-3">
        <Button className="flex-1" variant="outline" onClick={() => setCalcDialog(true)}>
          <Calculator className="w-4 h-4 mr-2" /> EMI Calculator
        </Button>
        <Button className="flex-1" onClick={() => setApplyDialog(true)}>
          <CreditCard className="w-4 h-4 mr-2" /> Apply for Loan
        </Button>
      </div>

      {/* Active Loans */}
      {loanList.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">My Loans</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {loanList.map((loan: any) => (
                <div key={loan.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{loan.purpose ?? "Personal Loan"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{loan.id}</p>
                    </div>
                    <Badge variant={statusColor(loan.status)}>{loan.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Principal</p>
                      <p className="font-semibold">{formatKobo(loan.principalKobo ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Monthly EMI</p>
                      <p className="font-semibold">{formatKobo(loan.emiKobo ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining</p>
                      <p className="font-semibold">{loan.remainingInstallments ?? 0} months</p>
                    </div>
                  </div>
                  {loan.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs"
                      onClick={() => payMutation.mutate({ loanId: loan.id })}
                      disabled={payMutation.isPending}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Pay This Month's EMI ({formatKobo(loan.emiKobo ?? 0)})
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No active loans. Apply for an EMI loan to get started.
          </CardContent>
        </Card>
      )}

      {/* Calculator Dialog */}
      <Dialog open={calcDialog} onOpenChange={setCalcDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>EMI Calculator</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Loan Amount (₦)</label>
              <Input type="number" placeholder="e.g. 100000" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Tenure (months)</label>
                <Input type="number" placeholder="12" value={tenure} onChange={(e) => setTenure(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Interest Rate (% p.a.)</label>
                <Input type="number" placeholder="18" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1" />
              </div>
            </div>
            {calcResult && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly EMI</span>
                  <span className="font-bold text-primary">{formatKobo(calcResult.emiKobo ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Payment</span>
                  <span className="font-semibold">{formatKobo(calcResult.totalPaymentKobo ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Interest</span>
                  <span className="font-semibold text-orange-600">{formatKobo(calcResult.totalInterestKobo ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalcDialog(false)}>Close</Button>
            <Button
              disabled={!principal || calcMutation.isPending}
              onClick={() => calcMutation.mutate({
                principalKobo: Math.round(Number(principal) * 100),
                tenureMonths: Number(tenure),
                annualRatePct: Number(rate),
              })}
            >
              Calculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Dialog */}
      <Dialog open={applyDialog} onOpenChange={setApplyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for EMI Loan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Loan Amount (₦)</label>
              <Input type="number" placeholder="e.g. 100000" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Tenure (months)</label>
                <Input type="number" placeholder="12" value={tenure} onChange={(e) => setTenure(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Interest Rate (% p.a.)</label>
                <Input type="number" placeholder="18" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Purpose</label>
              <Input placeholder="e.g. Home appliances, Education" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialog(false)}>Cancel</Button>
            <Button
              disabled={!principal || !purpose || applyMutation.isPending}
              onClick={() => applyMutation.mutate({
                principalKobo: Math.round(Number(principal) * 100),
                tenureMonths: Number(tenure),
                annualRatePercent: Number(rate),
                purpose,
              })}
            >
              {applyMutation.isPending ? "Submitting..." : "Apply Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
