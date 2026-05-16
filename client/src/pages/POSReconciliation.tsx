import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, RefreshCw, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Channel = "qr" | "card" | "nip" | "ussd" | "all";

const CHANNEL_LABELS: Record<string, string> = {
  qr: "QR / NQR",
  card: "Card (ISO 8583)",
  nip: "NIP Transfer",
  ussd: "USSD",
  all: "All Channels",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "Settled", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  reversed: { label: "Reversed", variant: "outline" },
};

function formatNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function POSReconciliation() {
  const [channel, setChannel] = useState<Channel>("all");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const queryInput = useMemo(() => ({
    from: new Date(from),
    to: new Date(to + "T23:59:59"),
    channel,
  }), [from, to, channel]);

  const { data, isLoading, isError, refetch } = trpc.pos.reconciliationReport.useQuery(queryInput);

  function downloadCsv() {
    if (!data?.csv) return;
    const blob = new Blob([data.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pos-reconciliation-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  const settlementRate = summary && summary.totalCount > 0
    ? ((summary.settledCount / summary.totalCount) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">POS Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Group POS transactions by terminal, settlement date, and channel
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={downloadCsv} disabled={!data?.csv}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">From</label>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">To</label>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Channel</label>
              <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Total Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary ? formatNgn(summary.totalVolumeKobo) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary ? summary.totalCount.toLocaleString() : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Settlement Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{settlementRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.settledCount.toLocaleString() ?? 0} of {summary?.totalCount.toLocaleString() ?? 0} settled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading reconciliation data…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">No POS transactions found</p>
              <p className="text-sm mt-1">Adjust the date range or register a POS terminal to start accepting payments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Settlement Date</TableHead>
                    <TableHead>Terminal</TableHead>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Volume (NGN)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const statusInfo = STATUS_BADGE[row.status ?? "pending"] ?? STATUS_BADGE.pending;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{String(row.settlementDate)}</TableCell>
                        <TableCell className="font-medium">{row.terminalLabel}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.serialNumber || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CHANNEL_LABELS[row.channel ?? ""] ?? row.channel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="text-xs">
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{row.transactionCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ₦{Number(row.totalVolumeNgn).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
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
