// @ts-nocheck
import { useParams } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, Clock, Download, Printer, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

function formatKobo(kobo: number, currency = "NGN") {
  const amount = kobo / 100;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
}

export default function TransactionReceipt() {
  const { id } = useParams<{ id: string }>();

  const { data: tx, isLoading, error } = trpc.wave25.receipts.getTransaction.useQuery({ id: id! }, { enabled: !!id });

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    const el = document.getElementById("receipt-content");
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><title>Receipt ${id}</title>
    <style>body{font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto}
    .header{text-align:center;margin-bottom:2rem}
    .row{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #eee}
    .status-success{color:#16a34a} .status-failed{color:#dc2626} .status-pending{color:#d97706}
    </style></head><body>${el.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `receipt-${id?.slice(0, 8)}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading receipt...</div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold">Transaction not found</h2>
          <Link href="/transactions">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Transactions
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusIcon = tx.status === "success" || tx.status === "completed"
    ? <CheckCircle2 className="h-12 w-12 text-green-500" />
    : tx.status === "failed"
    ? <XCircle className="h-12 w-12 text-red-500" />
    : <Clock className="h-12 w-12 text-yellow-500" />;

  const statusColor = tx.status === "success" || tx.status === "completed"
    ? "text-green-600" : tx.status === "failed" ? "text-red-600" : "text-yellow-600";

  // Show error toast when queries fail
  if (error) {
    toast.error(error.message ?? "An error occurred");
  }
  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      {/* Actions bar - hidden on print */}
      <div className="max-w-[600px] mx-auto mb-4 flex items-center justify-between print:hidden">
        <Link href="/transactions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      <Card className="max-w-[600px] mx-auto" id="receipt-content">
        <CardContent className="pt-8 pb-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">{statusIcon}</div>
            <h1 className="text-2xl font-bold">Payment Receipt</h1>
            <p className={`text-lg font-semibold mt-1 capitalize ${statusColor}`}>{tx.status}</p>
            <p className="text-3xl font-bold mt-2">
              {formatKobo(tx.amountKobo ?? 0, tx.currency ?? "NGN")}
            </p>
          </div>

          <Separator className="my-6" />

          {/* Transaction Details */}
          <div className="space-y-3">
            {[
              { label: "Transaction ID", value: tx.id, mono: true },
              { label: "Reference", value: tx.reference ?? "—", mono: true },
              { label: "Type", value: tx.type ?? "—" },
              { label: "Channel", value: tx.channel ?? "—" },
              { label: "Currency", value: tx.currency ?? "NGN" },
              { label: "Fee", value: tx.feeKobo ? formatKobo(tx.feeKobo, tx.currency ?? "NGN") : "—" },
              { label: "Net Amount", value: tx.netAmountKobo ? formatKobo(tx.netAmountKobo, tx.currency ?? "NGN") : "—" },
              { label: "Date", value: tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—" },
              { label: "Description", value: tx.description ?? "—" },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-start py-2 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className={`text-sm font-medium text-right max-w-[60%] break-all ${row.mono ? "font-mono text-xs" : ""}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-6" />

          {/* Merchant Info */}
          {tx.merchantId && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Merchant</p>
              <p className="text-sm font-medium">{tx.merchantId}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-xs text-muted-foreground">
              This is an official receipt from PayGate. Keep this for your records.
            </p>
            <Badge variant="outline" className="mt-2 text-xs">
              Powered by PayGate
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
