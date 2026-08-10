import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BanknoteIcon,
  CalendarIcon,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Send,
  Terminal,
  XCircle,
} from "lucide-react";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: "Pending",   color: "bg-amber-100 text-amber-800 border-amber-200",   icon: Clock },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800 border-blue-200",      icon: Send },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  failed:    { label: "Failed",    color: "bg-red-100 text-red-800 border-red-200",          icon: XCircle },
} as const;

type BatchStatus = keyof typeof STATUS_CONFIG;

function StatusBadge({ status }: { status: BatchStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function formatNGN(ngn: string) {
  return `₦${Number(ngn).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

// ─── Submit Batch Dialog ───────────────────────────────────────────────────────

function SubmitBatchDialog({
  settlementDate,
  totalNgn,
  onSubmitted,
}: {
  settlementDate: string;
  totalNgn: string;
  onSubmitted: (csv: string) => void;
}) {
  const submit = trpc.pos.submitBatch.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        onSubmitted(data.csv);
      } else {
        toast.warning(data.message);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs">
          <Send className="w-3 h-3" />
          Submit
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit PTSP Batch — {settlementDate}</AlertDialogTitle>
          <AlertDialogDescription>
            This will submit the <strong>{formatNGN(totalNgn)}</strong> settlement batch for{" "}
            <strong>{settlementDate}</strong> to the NIBSS PTSP endpoint via the Go bridge. The
            batch CSV will be generated and returned for download.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => submit.mutate({ settlementDate })}
            disabled={submit.isPending}
          >
            {submit.isPending ? "Submitting…" : "Submit Batch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PTSPSettlement() {
  const [downloadedCsvs, setDownloadedCsvs] = useState<Record<string, string>>({});

  const { data, isLoading, refetch, isFetching } = trpc.pos.settlementHistory.useQuery(
    { limit: 30, offset: 0 },
    { refetchOnWindowFocus: false , staleTime: 30_000 })

  const batches = data?.batches ?? [];

  // Summary stats
  const totalVolume = batches.reduce((s: any, b: any) => s + Number(b.totalNgn), 0);
  const totalTxns = batches.reduce((s: any, b: any) => s + b.transactionCount, 0);
  const pendingCount = batches.filter((b: any) => b.status === "pending").length;

  function downloadCsv(date: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ptsp_settlement_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PTSP Settlement</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily batch settlement history — NIBSS PTSP format (Nigerian Inter-Bank Settlement System)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh" onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        ><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <BanknoteIcon className="w-4 h-4" />
              Total Volume (30d)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalVolume.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Terminal className="w-4 h-4" />
              Total Transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTxns.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Pending Batches
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Settlement table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Daily Settlement Batches
          </CardTitle>
          <CardDescription>
            Each row represents one calendar day of POS transactions. Submit a batch to generate the
            NIBSS PTSP CSV and send it to the Go bridge settlement endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Loading settlement history…
            </div>
          ) : batches.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Terminal className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No POS transactions found. Register a terminal and process payments to see settlement
                batches here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement Date</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Volume (NGN)</TableHead>
                  <TableHead className="text-right">Terminals</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.settlementDate}>
                    <TableCell className="font-mono text-sm">{batch.settlementDate}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {batch.transactionCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNGN(batch.totalNgn)}
                    </TableCell>
                    <TableCell className="text-right">{batch.terminalCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {batch.channels.map((ch) => (
                          <Badge key={ch} variant="secondary" className="text-xs capitalize">
                            {ch}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={batch.status as BatchStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Submit batch */}
                        <SubmitBatchDialog
                          settlementDate={batch.settlementDate}
                          totalNgn={batch.totalNgn}
                          onSubmitted={(csv) => {
                            setDownloadedCsvs((prev) => ({
                              ...prev,
                              [batch.settlementDate]: csv,
                            }));
                          }}
                        />

                        {/* Download CSV if available */}
                        {downloadedCsvs[batch.settlementDate] ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 text-xs text-emerald-600"
                                onClick={() =>
                                  downloadCsv(
                                    batch.settlementDate,
                                    downloadedCsvs[batch.settlementDate]
                                  )
                                }
                              >
                                <Download className="w-3 h-3" />
                                CSV
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download PTSP batch CSV</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PTSP format info */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            About NIBSS PTSP Format
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            Each submitted batch generates a CSV in the NIBSS Payment Terminal Service Provider
            format: <code className="bg-muted px-1 rounded">terminal_id, merchant_id, amount_kobo, rrn, auth_code, date, channel</code>.
          </p>
          <p>
            The Go bridge endpoint <code className="bg-muted px-1 rounded">/v1/pos/settlement/batch</code> accepts the batch,
            signs it with the PTSP key, and forwards it to the NIBSS settlement gateway. In offline
            mode, batches are queued in Redis and flushed on reconnect.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
