import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Loader2,
  RefreshCw,
  ShieldAlert,
  ArrowUpRight,
  Upload,
} from "lucide-react";

type ChargebackRow = {
  id: string;
  transactionId: string | null;
  stripeChargeId: string | null;
  amountKobo: number;
  currency: string;
  reason: string;
  status: string;
  dueDate: string | Date | null;
  createdAt: string | Date;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "needs_response", label: "Needs Response" },
  { value: "under_review", label: "Under Review" },
  { value: "pre_arbitration", label: "Pre-Arbitration" },
  { value: "arbitration", label: "Arbitration" },
  { value: "closed_won", label: "Won" },
  { value: "closed_lost", label: "Lost" },
];

const STAGE_VARIANT: Record<string, string> = {
  needs_response: "bg-red-100 text-red-800 border-red-200",
  under_review: "bg-amber-100 text-amber-800 border-amber-200",
  pre_arbitration: "bg-orange-100 text-orange-800 border-orange-200",
  arbitration: "bg-purple-100 text-purple-800 border-purple-200",
  closed_won: "bg-green-100 text-green-800 border-green-200",
  closed_lost: "bg-gray-200 text-gray-700 border-gray-300",
};

const STAGE_LABEL: Record<string, string> = {
  needs_response: "Needs Response",
  under_review: "Under Review",
  pre_arbitration: "Pre-Arbitration",
  arbitration: "Arbitration",
  closed_won: "Won",
  closed_lost: "Lost",
};

const CLOSED_STATUSES = new Set(["closed_won", "closed_lost"]);

function formatNaira(kobo: number | string | null | undefined): string {
  const n = Number(kobo ?? 0);
  if (!Number.isFinite(n)) return "₦0.00";
  return `₦${(n / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function inferEvidenceType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "receipt";
  if (lower.match(/\.(png|jpe?g|gif|webp)$/)) return "customer_communication";
  return "other";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export default function DisputeLifecycle() {
  const utils = trpc.useUtils();
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");

  const listQuery = trpc.chargebackLifecycle.list.useQuery({
    page: 1,
    pageSize: 100,
    status: stageFilter === "all" ? undefined : stageFilter,
  });

  const chargebacks: ChargebackRow[] = useMemo(
    () => (listQuery.data?.rows ?? []),
    [listQuery.data]
  );

  const detailQuery = trpc.chargebackLifecycle.get.useQuery(
    { id: selectedId as string },
    { enabled: selectedId !== null }
  );

  const submitEvidence = trpc.chargebackLifecycle.uploadEvidence.useMutation({
    onSuccess: () => {
      toast.success("Evidence submitted");
      setEvidenceFile(null);
      void utils.chargebackLifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const escalate = trpc.chargebackLifecycle.escalate.useMutation({
    onSuccess: (res) => {
      toast.success(`Dispute escalated to ${res.newStatus}`);
      setEscalationReason("");
      void utils.chargebackLifecycle.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setEvidenceFile(null);
    setEscalationReason("");
  };

  const detail = detailQuery.data;
  const isClosed = detail ? CLOSED_STATUSES.has(detail.status) : false;

  const handleEvidenceSubmit = async () => {
    if (!detail || !evidenceFile) return;
    setUploading(true);
    try {
      const fileContentBase64 = await readFileAsBase64(evidenceFile);
      await submitEvidence.mutateAsync({
        chargebackId: detail.id,
        evidenceType: inferEvidenceType(evidenceFile.name),
        fileName: evidenceFile.name,
        mimeType: evidenceFile.type || "application/octet-stream",
        fileContentBase64,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Evidence upload failed"
      );
    } finally {
      setUploading(false);
    }
  };

  const handleEscalate = () => {
    if (!detail) return;
    if (!escalationReason.trim()) {
      toast.error("Escalation reason is required");
      return;
    }
    escalate.mutate({
      chargebackId: detail.id,
      reason: escalationReason.trim(),
      newStatus: "arbitration",
    });
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Dispute &amp; Chargeback Lifecycle
          </h1>
          <p className="text-muted-foreground">
            Track chargebacks, submit evidence, and escalate disputes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void listQuery.refetch()}
          disabled={listQuery.isFetching}
        >
          {listQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Chargebacks</CardTitle>
            <CardDescription>
              {listQuery.data?.total ?? 0} total disputes
            </CardDescription>
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chargebacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mb-2 opacity-40" />
              <p>No chargebacks found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargebacks.map((cb) => (
                  <TableRow
                    key={cb.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(cb.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {cb.stripeChargeId ?? cb.transactionId}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {cb.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNaira(cb.amountKobo)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STAGE_VARIANT[cb.status] ?? ""}
                      >
                        {STAGE_LABEL[cb.status] ?? cb.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(cb.dueDate)}</TableCell>
                    <TableCell>{formatDate(cb.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[90vh]">
          <div className="mx-auto w-full max-w-3xl overflow-y-auto p-6">
            <DrawerHeader>
              <DrawerTitle>
                Dispute {detail?.stripeChargeId ?? detail?.transactionId ?? ""}
              </DrawerTitle>
              <DrawerDescription>
                {detail
                  ? `${formatNaira(detail.amountKobo)} · ${
                      STAGE_LABEL[detail.status] ?? detail.status
                    } · due ${formatDate(detail.dueDate)}`
                  : "Loading…"}
              </DrawerDescription>
            </DrawerHeader>

            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="space-y-6">
                {detail.notes ? (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    {detail.notes}
                  </div>
                ) : null}

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
                  {detail.timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No timeline events recorded.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.timeline.map((ev) => (
                        <li
                          key={ev.id}
                          className="flex items-start gap-3 rounded-md border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{ev.event}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(ev.occurredAt)}
                              {ev.previousState && ev.newState
                                ? ` · ${ev.previousState} → ${ev.newState}`
                                : ""}
                            </p>
                            {ev.notes ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {ev.notes}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Submitted Evidence
                  </h3>
                  {detail.evidence.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No evidence submitted yet.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {detail.evidence.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <Badge variant="secondary">{item.evidenceType}</Badge>
                          <a
                            href={item.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary underline-offset-2 hover:underline"
                          >
                            {item.fileName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {!isClosed && (
                  <section className="space-y-3 rounded-md border p-4">
                    <h3 className="text-sm font-semibold">Submit Evidence</h3>
                    <input
                      type="file"
                      onChange={(e) =>
                        setEvidenceFile(e.target.files?.[0] ?? null)
                      }
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleEvidenceSubmit()}
                      disabled={
                        !evidenceFile || uploading || submitEvidence.isPending
                      }
                    >
                      {uploading || submitEvidence.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span className="ml-2">Upload &amp; Submit</span>
                    </Button>
                  </section>
                )}

                {!isClosed && detail.status !== "arbitration" && (
                  <section className="space-y-3 rounded-md border p-4">
                    <h3 className="text-sm font-semibold">
                      Escalate to Arbitration
                    </h3>
                    <Textarea
                      placeholder="Reason for escalation (required)"
                      value={escalationReason}
                      onChange={(e) => setEscalationReason(e.target.value)}
                      rows={3}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleEscalate}
                      disabled={escalate.isPending}
                    >
                      {escalate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                      <span className="ml-2">Escalate</span>
                    </Button>
                  </section>
                )}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Dispute not found.
              </p>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
