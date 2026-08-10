import { useState, useRef, useCallback } from "react";
import {
  RefreshCw, AlertTriangle, MessageSquare, Paperclip, X, Upload,
  CheckCircle2, ExternalLink, Clock, Search, ChevronLeft, ChevronRight,
  Filter, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 20;

type Dispute = {
  id: string;
  reference: string;
  amount: string | number;
  currency: string;
  status: string;
  reason?: string | null;
  dueDate?: Date | string | null;
  merchantResponse?: string | null;
  createdAt?: Date | string | null;
};

function SlaCountdown({ dueDate }: { dueDate: Date | string | null | undefined }) {
  if (!dueDate) return <span className="text-muted-foreground text-xs">—</span>;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const isBreached = diffMs < 0;
  const absDiff = Math.abs(diffMs);
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const label = isBreached
    ? `Breached ${hours}h ${mins}m ago`
    : hours < 2
    ? `${hours}h ${mins}m left`
    : `${hours}h left`;
  const color = isBreached
    ? "text-red-600 bg-red-50 border-red-200"
    : hours < 2
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-emerald-600 bg-emerald-50 border-emerald-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Clock className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:               "bg-red-50 text-red-700 border-red-200",
    under_review:       "bg-amber-50 text-amber-700 border-amber-200",
    merchant_responded: "bg-blue-50 text-blue-700 border-blue-200",
    resolved_merchant:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    resolved_customer:  "bg-sky-50 text-sky-700 border-sky-200",
    closed:             "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.open}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

interface EvidenceFile {
  name: string;
  mimeType: string;
  base64Data: string;
  url?: string;
}

interface RespondModalProps {
  dispute: Dispute;
  onClose: () => void;
  onSuccess: () => void;
}

function RespondModal({ dispute, onClose, onSuccess }: RespondModalProps) {
  const [response, setResponse] = useState(dispute.merchantResponse ?? "");
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const uploadMutation = trpc.disputes.uploadEvidence.useMutation();
  const respondMutation = trpc.disputes.respond.useMutation({
    onSuccess: () => {
      toast.success("Counter-claim submitted successfully");
      utils.disputes.list.invalidate();
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — maximum 10 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(",")[1];
      const idx = files.length;
      const newFile: EvidenceFile = { name: file.name, mimeType: file.type, base64Data };
      setFiles((prev) => [...prev, newFile]);
      setUploadingIdx(idx);
      try {
        const result = await uploadMutation.mutateAsync({
          disputeId: dispute.id,
          fileName: file.name,
          mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf',
          base64Data,
        });
        setFiles((prev) =>
          prev.map((f: any, i: any) => (i === idx ? { ...f, url: result.url } : f))
        );
        toast.success("Evidence uploaded");
      } catch (err: any) {
        toast.error("Upload failed: " + err.message);
        setFiles((prev) => prev.filter((_, i) => i !== idx));
      } finally {
        setUploadingIdx(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    const evidenceMap: Record<string, string> = {};
    files.forEach((f: any, i: any) => {
      if (f.url) evidenceMap[`file_${i + 1}`] = f.url;
    });
    respondMutation.mutate({
      id: dispute.id,
      merchantResponse: response,
      evidence: Object.keys(evidenceMap).length > 0 ? evidenceMap : undefined,
    });
  }

  const canSubmit = response.length >= 10 && !respondMutation.isPending && uploadingIdx === null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-foreground)" }}>
              Dispute Response
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>
              {dispute.reference} · {dispute.currency} {Number(dispute.amount).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--color-muted-foreground)" }} className="hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {dispute.reason && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--color-foreground)" }}
            >
              <span className="font-medium text-xs uppercase tracking-wide" style={{ color: "#ef4444" }}>
                Customer Claim
              </span>
              <p className="mt-1" style={{ color: "var(--color-foreground)" }}>{dispute.reason}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-foreground)" }}>
              Counter-claim <span style={{ color: "var(--color-destructive)" }}>*</span>
            </label>
            <textarea
              value={response}
              onChange={(e: any) => setResponse(e.target.value)}
              rows={4}
              placeholder="Describe your position clearly (minimum 10 characters). Include order details, delivery confirmation, or any relevant context..."
              className="w-full px-3 py-2 text-sm rounded-lg resize-none outline-none focus:ring-2"
              style={{
                background: "var(--color-background)",
                border: "1px solid var(--color-border)",
                color: "var(--color-foreground)",
              }}
            />
            <p className="text-xs mt-1" style={{ color: response.length < 10 ? "var(--color-destructive)" : "var(--color-muted-foreground)" }}>
              {response.length}/10 minimum characters
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-foreground)" }}>
              Supporting Evidence <span style={{ color: "var(--color-muted-foreground)" }}>(optional)</span>
            </label>
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)" }}
                >
                  {uploadingIdx === idx ? (
                    <Upload size={14} className="animate-bounce" style={{ color: "var(--color-primary)" }} />
                  ) : f.url ? (
                    <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                  ) : (
                    <Paperclip size={14} style={{ color: "var(--color-muted-foreground)" }} />
                  )}
                  <span className="flex-1 truncate text-xs" style={{ color: "var(--color-foreground)" }}>{f.name}</span>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)" }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {uploadingIdx !== idx && (
                    <button onClick={() => removeFile(idx)} style={{ color: "var(--color-muted-foreground)" }} className="hover:opacity-70">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingIdx !== null}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs w-full transition-colors"
                style={{
                  background: "var(--color-background)",
                  border: "1px dashed var(--color-border)",
                  color: "var(--color-muted-foreground)",
                }}
              >
                <Paperclip size={13} />
                Attach screenshot, receipt, or PDF (max 10 MB)
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {respondMutation.isPending ? "Submitting…" : "Submit Counter-Claim"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Disputes() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [respondingDispute, setRespondingDispute] = useState<Dispute | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch, isFetching } = trpc.disputes.list.useQuery(
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE, status: statusFilter },
    { staleTime: 30_000 }
  );

  const rows = (data?.rows ?? []) as Dispute[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side search filter on current page
  const filteredRows = search.trim()
    ? rows.filter((d) =>
        d.reference?.toLowerCase().includes(search.toLowerCase()) ||
        d.reason?.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const handleStatusFilter = useCallback((s: string) => {
    setStatusFilter(s || undefined);
    setPage(0);
  }, []);

  // Export current page as CSV
  function handleExport() {
    const headers = ["Reference", "Amount", "Currency", "Status", "Reason", "Due Date", "Created"];
    const csvRows = [
      headers.join(","),
      ...rows.map((d) => [
        d.reference,
        Number(d.amount),
        d.currency,
        d.status,
        `"${(d.reason ?? "").replace(/"/g, '""')}"`,
        d.dueDate ? new Date(d.dueDate as string).toISOString() : "",
        d.createdAt ? new Date(d.createdAt as string).toISOString() : "",
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disputes-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  // Status counts for badges
  const openCount = rows.filter((d) => d.status === "open").length;
  const reviewCount = rows.filter((d) => d.status === "under_review").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Disputes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} total · {openCount} open · {reviewCount} under review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-1.5" />Export CSV
          </Button>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isFetching}><RefreshCw/>Refresh
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by reference or reason…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {["", "open", "under_review", "merchant_responded", "resolved_merchant", "resolved_customer", "closed"].map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                statusFilter === (s || undefined)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              {s ? s.replace(/_/g, " ") : "All"}
              {s === "open" && openCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1">{openCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Reference", "Amount", "Status", "Reason", "SLA / Due Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : filteredRows.length === 0
              ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No disputes found</p>
                      {search && <p className="text-xs mt-1">Try adjusting your search or filters</p>}
                    </td>
                  </tr>
                )
              : filteredRows.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.reference}</td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      {d.currency} {Number(d.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]" title={d.reason ?? ""}>
                      {d.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          {d.dueDate ? new Date(d.dueDate as string).toLocaleDateString() : "—"}
                        </div>
                        {(d.status === "open" || d.status === "under_review") && (
                          <SlaCountdown dueDate={d.dueDate} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(d.status === "open" || d.status === "under_review") && (
                          <button
                            onClick={() => setRespondingDispute(d)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Respond
                          </button>
                        )}
                        {d.merchantResponse && d.status !== "open" && d.status !== "under_review" && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />Responded
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table></div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} disputes
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 px-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="h-8 px-2"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Respond modal */}
      {respondingDispute && (
        <RespondModal
          dispute={respondingDispute}
          onClose={() => setRespondingDispute(null)}
          onSuccess={() => setRespondingDispute(null)}
        />
      )}
    </div>
  );
}
