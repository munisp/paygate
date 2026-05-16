import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";

export default function BNPLv2() {
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const { isLoading, data: loansData } = trpc.tier6to8.bnplV2.getLoans.useQuery({ status: "all" }, { staleTime: 30_000 });
  const checkMutation = trpc.tier6to8.bnplV2.checkEligibility.useMutation({
    onSuccess: (d: any) => toast.success(`Score: ${d.creditScore} — Max: ₦${(d.maxAmountKobo / 100).toLocaleString()}`),
    onError: (e: any) => toast.error(e.message),
  });
  const createMutation = trpc.tier6to8.bnplV2.createLoan.useMutation({
    onSuccess: (d: any) => toast.success(`Loan created: ${d.loanId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const repayMutation = trpc.tier6to8.bnplV2.reportRepayment.useMutation({
    onSuccess: () => toast.success("Repayment recorded"),
    onError: (e: any) => toast.error(e.message),
  });

  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "active" ? "default" : s === "defaulted" ? "destructive" : "secondary";

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-8 h-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold">BNPL v2 — Credit Bureau Integration</h1>
          <p className="text-muted-foreground">Buy Now Pay Later with real-time credit bureau scoring</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Check Eligibility</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Customer ID" value={customerId} onChange={e => setCustomerId(e.target.value)} />
            <Input type="number" placeholder="Amount (₦)" value={amount} onChange={e => setAmount(e.target.value)} />
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline"
                onClick={() => checkMutation.mutate({ customerId, amountKobo: Math.round(parseFloat(amount || "0") * 100) })}
                disabled={checkMutation.isPending}>
                {checkMutation.isPending ? "Checking..." : "Check Credit Bureau"}
              </Button>
              <Button className="flex-1"
                onClick={() => createMutation.mutate({ customerId, amountKobo: Math.round(parseFloat(amount || "0") * 100), termMonths: 6 })}
                disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Loan"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Active Loans</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {loansData?.loans.map((loan: any) => (
                <div key={loan.loanId} className="p-3 border rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">{loan.customerId}</p>
                    <p className="text-xs text-muted-foreground">₦{(loan.amountKobo / 100).toLocaleString()} — Due: {new Date(loan.nextDueDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">Outstanding: ₦{(loan.outstandingKobo / 100).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={statusColor(loan.status)}>{loan.status}</Badge>
                    {loan.status === "active" && (
                      <Button size="sm" variant="outline"
                        onClick={() => repayMutation.mutate({ loanId: loan.loanId, amountKobo: loan.outstandingKobo, paymentMethod: "wallet" })}>
                        Repay
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!loansData?.loans.length && <p className="text-center text-muted-foreground py-8">No loans yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
