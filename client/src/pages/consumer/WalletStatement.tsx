import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";

const PERIODS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 6 months", value: "180" },
  { label: "Last 12 months", value: "365" },
];

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WalletStatement() {
  const [period, setPeriod] = useState("30");

  const { data: walletData, isError } = trpc.consumerWallet.getOrCreate.useQuery({ currency: 'NGN' });
  const { data: txns, isLoading } = trpc.consumerWallet.listTransactions.useQuery({
    limit: 200,
    offset: 0,
    currency: "NGN",
  });

  const transactions = (txns?.rows ?? []).filter((t: any) => {
    const days = parseInt(period);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Date(t.createdAt).getTime() >= cutoff;
  });

  const totalCredits = transactions
    .filter((t: any) => ["wallet_credit", "topup", "p2p_receive"].includes(t.type))
    .reduce((sum: number, t: any) => sum + (t.amountKobo ?? 0), 0);

  const totalDebits = transactions
    .filter((t: any) => !["wallet_credit", "topup", "p2p_receive"].includes(t.type))
    .reduce((sum: number, t: any) => sum + (t.amountKobo ?? 0), 0);

  function handleExportCSV() {
    const headers = ["Date", "Type", "Description", "Amount (₦)", "Balance After (₦)", "Reference", "Status"];
    const rows = transactions.map((t: any) => [
      new Date(t.createdAt).toISOString(),
      t.type,
      t.description ?? "",
      ((t.amountKobo ?? 0) / 100).toFixed(2),
      ((t.balanceAfterKobo ?? 0) / 100).toFixed(2),
      t.reference ?? "",
      t.status ?? "completed",
    ]);
    const csv = [headers, ...rows]
      .map((r: any) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadCSV(csv, `wallet-statement-${period}d-${Date.now()}.csv`);
    toast.success("Statement exported as CSV");
  }

  function handleExportPDF() {
    toast.info("PDF export — generating...");
    // Build a simple printable HTML page
    const html = `<!DOCTYPE html><html><head><title>Wallet Statement</title>
<style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style>
</head><body>
<h2>PayGate Wallet Statement — Last ${period} Days</h2>
<p>Generated: ${new Date().toLocaleString()}</p>
<table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount (₦)</th><th>Status</th></tr></thead>
<tbody>${transactions.map((t: any) => `<tr>
<td>${new Date(t.createdAt).toLocaleDateString()}</td>
<td>${t.type}</td>
<td>${t.description ?? ""}</td>
<td>${((t.amountKobo ?? 0) / 100).toFixed(2)}</td>
<td>${t.status ?? "completed"}</td>
</tr>`).join("")}</tbody></table>
</body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Wallet Statement</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Download your transaction history
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-xl font-bold">
                  ₦{((walletData?.balanceKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-xl font-bold text-green-600">
                  +₦{(totalCredits / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className="text-xl font-bold text-red-600">
                  -₦{(totalDebits / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label>Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p: any) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{transactions.length} transactions</span>
          </div>
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Showing last {period} days</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No transactions in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount (₦)</TableHead>
                    <TableHead className="text-right">Balance After (₦)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 100).map((t: any) => {
                    const isCredit = ["wallet_credit", "topup", "p2p_receive"].includes(t.type);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {t.type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-48 truncate">{t.description ?? "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${isCredit ? "text-green-600" : "text-red-600"}`}>
                          {isCredit ? "+" : "-"}₦{((t.amountKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          ₦{((t.balanceAfterKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-xs">
                            {t.status ?? "completed"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
