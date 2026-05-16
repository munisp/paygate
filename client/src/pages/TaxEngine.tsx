import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calculator, Receipt, BookOpen } from "lucide-react";

function formatNGN(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function TaxEngine() {
  const [amountNGN, setAmountNGN] = useState("10000");
  const [txType, setTxType] = useState<"payment" | "bank_transfer" | "service_fee" | "subscription" | "payout" | "invoice">("payment");
  const [includeWht, setIncludeWht] = useState(false);
  const [month, setMonth] = useState(currentMonth());

  const amountKobo = Math.round(parseFloat(amountNGN || "0") * 100);

  const { data: taxCalc, isLoading: calcLoading, error } = trpc.tier6to8.taxEngine.calculateTax.useQuery(
    { amountKobo, transactionType: txType, includeWht },
    { enabled: amountKobo > 0 }
  , { staleTime: 30_000 });

  const { data: remittance, isLoading: remitLoading } = trpc.tier6to8.taxEngine.getMonthlyRemittance.useQuery({ month }, { staleTime: 30_000 });
  const { data: rates } = trpc.tier6to8.taxEngine.getTaxRates.useQuery();

  // Show error toast when queries fail
  if (error) {
    toast.error(error.message ?? "An error occurred");
  }
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tax Engine</h1>
        <p className="text-muted-foreground">Nigerian VAT, WHT, Stamp Duty, and FIRS remittance calculator</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calculator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Tax Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Transaction Amount (₦)</Label>
              <Input
                type="number"
                value={amountNGN}
                onChange={(e: any) => setAmountNGN(e.target.value)}
                placeholder="10000"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Transaction Type</Label>
              <Select value={txType} onValueChange={(v: any) => setTxType(v as typeof txType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="service_fee">Service Fee</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="payout">Payout</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includeWht} onCheckedChange={setIncludeWht} id="wht" />
              <Label htmlFor="wht">Include Withholding Tax (WHT)</Label>
            </div>

            {calcLoading ? (
              <div className="animate-pulse h-32 bg-muted/20 rounded" />
            ) : taxCalc ? (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Amount</span>
                  <span className="font-mono">{formatNGN(taxCalc.grossAmountKobo)}</span>
                </div>
                {taxCalc.taxBreakdown.map((t: { taxType: string; description: string; rate: number; amountKobo: number }, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.description} ({(t.rate * 100).toFixed(1)}%)</span>
                    <span className="font-mono text-red-600">-{formatNGN(t.amountKobo)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Net Amount</span>
                  <span className="font-mono text-green-600">{formatNGN(taxCalc.netAmountKobo)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Effective Tax Rate</span>
                  <span>{taxCalc.effectiveTaxRatePct.toFixed(2)}%</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Monthly Remittance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Monthly FIRS Remittance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e: any) => setMonth(e.target.value)}
                className="mt-1"
              />
            </div>
            {remitLoading ? (
              <div className="animate-pulse h-32 bg-muted/20 rounded" />
            ) : remittance ? (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT Collected</span>
                  <span className="font-mono">{formatNGN(remittance.vatKobo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">WHT Withheld</span>
                  <span className="font-mono">{formatNGN(remittance.whtKobo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stamp Duty</span>
                  <span className="font-mono">{formatNGN(remittance.stampDutyKobo)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total Remittance</span>
                  <span className="font-mono">{formatNGN(remittance.totalRemittanceKobo)}</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Due Date: <strong>{remittance.dueDate}</strong></p>
                  <p>Reference: <code className="bg-muted px-1 rounded">{remittance.paymentReference}</code></p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Tax Rates Reference */}
      {rates && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Current Tax Rates (Nigeria)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Tax Type</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Rate</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.entries(rates.rates) as [string, { rate: number; description: string; remitTo: string }][]).map(([key, rate]) => (
                    <tr key={key} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 font-mono text-xs">{key}</td>
                      <td className="py-2">{rate.description}</td>
                      <td className="py-2 text-right">
                        <Badge variant="outline">{(rate.rate * 100).toFixed(1)}%</Badge>
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{rate.remitTo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
