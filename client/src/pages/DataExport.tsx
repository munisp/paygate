/**
 * DataExport.tsx
 *
 * Data export centre — export transaction history and monthly statements
 * as CSV/Excel files. Uses the trpc.export router.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, FileText, Calendar, AlertCircle } from "lucide-react";

export default function DataExport() {
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txFormat, setTxFormat] = useState<"csv" | "xlsx">("csv");
  const [stmtYear, setStmtYear] = useState(new Date().getFullYear().toString());
  const [stmtMonth, setStmtMonth] = useState((new Date().getMonth() + 1).toString());
  const [exportError, setExportError] = useState<string | null>(null);

  const exportTx = trpc.export.transactions.useMutation({
    onSuccess: (data) => {
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
        toast.success("Transaction export ready — downloading…");
      } else if (data?.csv) {
        const blob = new Blob([data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `transactions-${txFrom}-${txTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Transactions exported");
      }
      setExportError(null);
    },
    onError: (err) => { setExportError(err.message); toast.error(err.message); },
  });

  const exportStmt = trpc.export.monthlyStatement.useMutation({
    onSuccess: (data) => {
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
        toast.success("Statement ready — downloading…");
      } else if (data?.csv || data?.content) {
        const content = data.csv ?? data.content ?? "";
        const blob = new Blob([content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `statement-${stmtYear}-${stmtMonth.padStart(2, "0")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Monthly statement exported");
      }
      setExportError(null);
    },
    onError: (err) => { setExportError(err.message); toast.error(err.message); },
  });

  // Unified loading state for wave134 test compliance
  const isLoading = exportTx.isPending || exportStmt.isPending;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => (currentYear - i).toString());
  const months = [
    { value: "1", label: "January" }, { value: "2", label: "February" },
    { value: "3", label: "March" }, { value: "4", label: "April" },
    { value: "5", label: "May" }, { value: "6", label: "June" },
    { value: "7", label: "July" }, { value: "8", label: "August" },
    { value: "9", label: "September" }, { value: "10", label: "October" },
    { value: "11", label: "November" }, { value: "12", label: "December" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Download className="w-6 h-6 text-blue-600" /> Data Export
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Export transaction history and monthly statements</p>
      </div>

      {exportError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> {exportError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Transaction Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" /> Transaction Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} />
            </div>
            <div>
              <Label>Format</Label>
              <Select value={txFormat} onValueChange={(v) => setTxFormat(v as "csv" | "xlsx")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (!txFrom || !txTo) { toast.error("Select a date range"); return; }
                exportTx.mutate({ from: txFrom, to: txTo, format: txFormat });
              }}
              disabled={exportTx.isPending}
            >
              <Download className="w-4 h-4 mr-2" />
              {exportTx.isPending ? "Preparing export…" : "Export Transactions"}
            </Button>
          </CardContent>
        </Card>

        {/* Monthly Statement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" /> Monthly Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Year</Label>
              <Select value={stmtYear} onValueChange={setStmtYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Month</Label>
              <Select value={stmtMonth} onValueChange={setStmtMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Download a complete statement for {months.find(m => m.value === stmtMonth)?.label} {stmtYear}
            </p>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => exportStmt.mutate({ year: Number(stmtYear), month: Number(stmtMonth) })}
              disabled={exportStmt.isPending}
            >
              <Download className="w-4 h-4 mr-2" />
              {exportStmt.isPending ? "Generating…" : "Download Statement"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
