import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SalaryAccounts() {
  const [accountType, setAccountType] = useState<"salary" | "current" | "savings">("salary");
  const [employerRcNumber, setEmployerRcNumber] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");

  const { data: account } = trpc4.salaryAccounts.getAccount.useQuery();
  const { data: transactions } = trpc4.salaryAccounts.getTransactions.useQuery({ page: 1, limit: 20 });

  const openMutation = trpc4.salaryAccounts.openAccount.useMutation({
    onSuccess: (d) => toast.success(`Account ${d.accountNumber} opened at ${d.bankName}`),
    onError: (e) => toast.error(e.message),
  });
  const advanceMutation = trpc4.salaryAccounts.getSalaryAdvance.useMutation({
    onSuccess: (d) => toast.success(`Advance of ₦${(d.approvedAmountKobo / 100).toLocaleString()} approved`),
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const txTypeColor = (t: string) => ({ credit: "text-green-600", debit: "text-red-600" }[t] ?? "text-gray-600");

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Salary Accounts</h1>

      {account ? (
        <>
          {/* Account Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Account Details</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{account.accountNumber}</p>
                <p className="text-sm text-muted-foreground">{account.bankName}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="capitalize">{account.accountType}</Badge>
                  <Badge variant={account.status === "active" ? "default" : "secondary"}>{account.status}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Balance</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatKobo(account.balanceKobo)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Salary Day</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{account.salaryDayOfMonth}th</p>
                {account.employerName && <p className="text-xs text-muted-foreground">{account.employerName}</p>}
              </CardContent>
            </Card>
          </div>

          {/* Salary Advance */}
          <Card>
            <CardHeader><CardTitle className="text-base">Salary Advance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Get up to 50% of your expected salary in advance. Repayment deducted on salary day.</p>
              <div className="flex gap-3">
                <Input placeholder="Advance amount (₦)" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} className="flex-1" />
                <Button disabled={advanceMutation.isPending}
                  onClick={() => advanceMutation.mutate({ requestedAmountKobo: Math.round(parseFloat(advanceAmount) * 100) })}>
                  {advanceMutation.isPending ? "Processing..." : "Request Advance"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
            <CardContent>
              {!transactions?.transactions?.length ? <p className="text-muted-foreground text-sm">No transactions yet</p> :
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Balance</th><th className="text-right py-2">Date</th></tr></thead>
                  <tbody>
                    {transactions.transactions.map(t => (
                      <tr key={t.id} className="border-b hover:bg-muted/30">
                        <td className="py-2">
                          <p>{t.description}</p>
                          <p className="text-xs text-muted-foreground capitalize">{t.type}</p>
                        </td>
                        <td className={`text-right font-semibold ${txTypeColor(t.type)}`}>
                          {t.type === "credit" ? "+" : "-"}{formatKobo(t.amountKobo)}
                        </td>
                        <td className="text-right">{formatKobo(t.balance)}</td>
                        <td className="text-right text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-dashed">
          <CardHeader><CardTitle>Open a Salary Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Open a dedicated salary account with automatic salary crediting and advance features.</p>
            <div className="flex gap-2">
              {(["salary", "current", "savings"] as const).map(t => (
                <Button key={t} variant={accountType === t ? "default" : "outline"} size="sm" onClick={() => setAccountType(t)} className="capitalize">{t}</Button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Employer RC Number (optional)</label><Input value={employerRcNumber} onChange={e => setEmployerRcNumber(e.target.value)} placeholder="RC123456" /></div>
              <div><label className="text-xs text-muted-foreground">Expected Monthly Salary (₦)</label><Input value={expectedSalary} onChange={e => setExpectedSalary(e.target.value)} placeholder="200000" /></div>
            </div>
            <Button disabled={openMutation.isPending}
              onClick={() => openMutation.mutate({ accountType, employerRcNumber: employerRcNumber || undefined, expectedMonthlySalaryKobo: expectedSalary ? Math.round(parseFloat(expectedSalary) * 100) : undefined })}>
              {openMutation.isPending ? "Opening..." : "Open Account"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
