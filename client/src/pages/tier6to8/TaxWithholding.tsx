import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Receipt, FileText } from "lucide-react";

export default function TaxWithholding() {
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<"goods" | "services" | "rent" | "dividend" | "interest">("services");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const year = parseInt(period.slice(0, 4));
  const { isLoading, data: summary } = trpc.tier6to8.taxWithholding.getTaxSummary.useQuery({ year });
  const calcQuery = trpc.tier6to8.taxWithholding.calculateWithholding.useQuery(
    { transactionAmountKobo: Math.round(parseFloat(txAmount || "0") * 100), transactionType: txType, vendorType: "company" },
    { enabled: parseFloat(txAmount) > 0 }
  );
  const remitMutation = trpc.tier6to8.taxWithholding.remitTax.useMutation({
    onSuccess: (d: any) => toast.success(`Tax remitted — Ref: ${d.remittanceId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const certMutation = trpc.tier6to8.taxWithholding.generateTaxCertificate.useMutation({
    onSuccess: (d: any) => { window.open(d.certificateUrl, "_blank"); toast.success("Tax certificate generated"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="w-8 h-8 text-amber-600" />
        <div><h1 className="text-2xl font-bold">Tax Withholding Engine</h1><p className="text-muted-foreground">Automated WHT calculation, remittance, and certificate generation</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Calculate WHT</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="number" placeholder="Transaction Amount (₦)" value={txAmount} onChange={e => setTxAmount(e.target.value)} />
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={txType} onChange={e => setTxType(e.target.value as any)}>
              <option value="services">Services (10%)</option>
              <option value="goods">Goods (5%)</option>
              <option value="rent">Rent (10%)</option>
              <option value="dividend">Dividend (10%)</option>
              <option value="interest">Interest (10%)</option>
            </select>
            <Button className="w-full" disabled={!txAmount}>
              Calculate WHT
            </Button>
            {calcQuery.data && (
              <div className="p-3 bg-amber-50 rounded-lg text-sm space-y-1 border border-amber-200">
                <div className="flex justify-between"><span>WHT Rate</span><span>{(calcQuery.data.withholdingRate * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between font-bold text-amber-700"><span>WHT Amount</span><span>₦{(calcQuery.data.withholdingAmountKobo / 100).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Net Payable</span><span>₦{(calcQuery.data.netPayableKobo / 100).toLocaleString()}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monthly Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            {summary && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Total WHT</span><span className="font-bold text-amber-600">₦{(summary.totalWHT / 100).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Remitted</span><span className="font-bold text-green-600">₦{(summary.remitted / 100).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Outstanding</span><span className="font-bold text-red-600">₦{(summary.outstanding / 100).toLocaleString()}</span></div>
                <Badge variant={summary.outstanding > 0 ? "destructive" : "default"}>
                  {summary.outstanding > 0 ? "Remittance Due" : "Up to Date"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" variant="outline" disabled={remitMutation.isPending}
              onClick={() => remitMutation.mutate({ period, taxType: "WHT" })}>
              {remitMutation.isPending ? "Remitting..." : "Remit Tax to FIRS"}
            </Button>
            <Button className="w-full" variant="outline" disabled={certMutation.isPending}
              onClick={() => certMutation.mutate({ vendorId: "self", period })}>
              {certMutation.isPending ? "Generating..." : "Generate Tax Certificate"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
