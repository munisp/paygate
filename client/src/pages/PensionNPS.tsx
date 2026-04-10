import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function PensionNPS() {
  const [contribAmount, setContribAmount] = useState("");
  const [contribType, setContribType] = useState<"voluntary" | "mandatory">("voluntary");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: account } = trpc4.pension.getAccount.useQuery();
  const { data: pfas } = trpc4.pension.listPFAs.useQuery();
  const { data: statements } = trpc4.pension.getStatements.useQuery({ year: selectedYear });

  const contributeMutation = trpc4.pension.makeContribution.useMutation({
    onSuccess: (d) => toast.success(`Contribution of ₦${(d.amountKobo / 100).toLocaleString()} successful`),
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Pension / NPS</h1>

      {account ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">RSA PIN</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-mono font-bold">{account.rsaPin}</p><p className="text-xs text-muted-foreground">{account.pfaName}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Contributions</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{formatKobo(account.totalContributionsKobo)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current Value</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold text-green-600">{formatKobo(account.currentValueKobo)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Returns</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold text-green-600">+{account.returns?.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Retirement: {new Date(account.retirementDate).toLocaleDateString()}</p></CardContent></Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">No pension account found. Open one to start saving for retirement.</p>
          </CardContent>
        </Card>
      )}

      {/* Make Contribution */}
      {account && (
        <Card>
          <CardHeader><CardTitle className="text-base">Make Contribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant={contribType === "voluntary" ? "default" : "outline"} size="sm" onClick={() => setContribType("voluntary")}>Voluntary</Button>
              <Button variant={contribType === "mandatory" ? "default" : "outline"} size="sm" onClick={() => setContribType("mandatory")}>Mandatory</Button>
            </div>
            <Input placeholder="Amount (₦)" value={contribAmount} onChange={e => setContribAmount(e.target.value)} />
            <Button className="w-full" disabled={contributeMutation.isPending}
              onClick={() => contributeMutation.mutate({ amountKobo: Math.round(parseFloat(contribAmount) * 100), contributionType: contribType })}>
              {contributeMutation.isPending ? "Processing..." : "Contribute"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Statements */}
      {account && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Statements</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedYear(y => y - 1)}>◀ {selectedYear - 1}</Button>
                <span className="px-3 py-1 text-sm font-semibold">{selectedYear}</span>
                <Button variant="outline" size="sm" onClick={() => setSelectedYear(y => y + 1)}>▶ {selectedYear + 1}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!statements?.statements?.length ? <p className="text-muted-foreground text-sm">No statements for {selectedYear}</p> :
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2">Month</th><th className="text-right py-2">Employer</th><th className="text-right py-2">Employee</th><th className="text-right py-2">Returns</th><th className="text-right py-2">Balance</th></tr></thead>
                <tbody>
                  {statements.statements.map((s, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-2">{s.month}</td>
                      <td className="text-right">{formatKobo(s.employerContributionKobo)}</td>
                      <td className="text-right">{formatKobo(s.employeeContributionKobo)}</td>
                      <td className="text-right text-green-600">+{formatKobo(s.investmentReturnKobo)}</td>
                      <td className="text-right font-semibold">{formatKobo(s.closingBalanceKobo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {/* PFAs List */}
      <Card>
        <CardHeader><CardTitle>Pension Fund Administrators</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pfas?.pfas?.map(pfa => (
              <div key={pfa.code} className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="font-semibold text-sm">{pfa.name}</p>
                  <p className="text-xs text-muted-foreground">Code: {pfa.code}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">{pfa.rating}</Badge>
                  <p className="text-xs text-green-600 mt-1">YTD: +{pfa.returnsYtd?.toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
