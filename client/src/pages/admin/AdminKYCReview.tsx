// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, CheckCircle, XCircle, AlertTriangle, Eye, X,
  FileText, User, Camera, ZoomIn, ZoomOut, ExternalLink, Info,
} from "lucide-react";
import { toast } from "sonner";

// ── Score helpers ─────────────────────────────────────────────────────────────
const scoreColor = (v: number | null | undefined) => {
  if (v == null) return "text-slate-500";
  if (v >= 0.9) return "text-emerald-400";
  if (v >= 0.7) return "text-amber-400";
  return "text-red-400";
};
const scoreBarColor = (v: number | null | undefined) => {
  if (v == null) return "bg-slate-700";
  if (v >= 0.9) return "bg-emerald-500";
  if (v >= 0.7) return "bg-amber-500";
  return "bg-red-500";
};
const isBorderline = (v: number | null | undefined) => v != null && v >= 0.7 && v < 0.9;
const isLow = (v: number | null | undefined) => v != null && v < 0.7;

function ScoreBar({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {isLow(value) && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
      <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(value)}`}
          style={{ width: `${(value * 100).toFixed(0)}%` }}
        />
      </div>
      <span className={`text-xs font-mono ${scoreColor(value)}`}>{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

// ── Document Lightbox ─────────────────────────────────────────────────────────
function DocumentLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const isPdf = url.toLowerCase().includes(".pdf");
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 backdrop-blur flex-shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-slate-400 font-mono truncate max-w-xs">{url.split("/").pop()}</span>
        <div className="flex items-center gap-2">
          {!isPdf && (
            <>
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 rounded hover:bg-slate-700 text-slate-300">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
              <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-1.5 rounded hover:bg-slate-700 text-slate-300">
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-slate-700 text-slate-300" onClick={e => e.stopPropagation()}>
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-700 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        {isPdf ? (
          <iframe src={url} className="w-full max-w-4xl h-[80vh] rounded border border-slate-700" title="Document" />
        ) : (
          <img
            src={url}
            alt="KYC Document"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.15s" }}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}

// ── Detail Side Panel ─────────────────────────────────────────────────────────
function SubmissionDetailPanel({ submissionId, onClose }: { submissionId: number; onClose: () => void }) {
  const detailQuery = trpc.admin.kyc.getSubmission.useQuery({ submissionId }, { staleTime: 30_000 });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const data = detailQuery.data as any;
  const sub = data?.submission;
  const merchantName = data?.merchantName;
  const merchantEmail = data?.merchantEmail;

  return (
    <>
      {lightboxUrl && <DocumentLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/40" onClick={onClose} />
        <div className="w-[480px] max-w-[100vw] bg-slate-900 border-l border-slate-800 overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">Submission #{submissionId}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{merchantName ?? "—"} · {merchantEmail ?? "—"}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {detailQuery.isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 bg-slate-800" />)}
            </div>
          ) : !sub ? (
            <div className="p-5 text-slate-500 text-sm">Submission not found</div>
          ) : (
            <div className="p-5 space-y-6">
              {/* Status & Doc Type */}
              <div className="flex items-center gap-3">
                <Badge className={`capitalize text-xs border ${
                  sub.status === "approved" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                  sub.status === "rejected" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                  "bg-amber-500/20 text-amber-400 border-amber-500/30"
                }`}>{sub.status}</Badge>
                <span className="text-xs text-slate-400 capitalize">{sub.docType?.replace(/_/g, " ") ?? "—"}</span>
                {sub.livenessOverride && (
                  <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">Override</Badge>
                )}
              </div>

              {/* Scores */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Verification Scores</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Liveness", value: sub.livenessScore },
                    { label: "Face Match", value: sub.faceMatchScore },
                    { label: "BVN Match", value: sub.bvnMatchScore },
                    { label: "OCR Confidence", value: sub.ocrConfidence },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-800/60 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                      <ScoreBar value={value} />
                    </div>
                  ))}
                </div>
                {/* BVN Verification Status */}
                {sub.bvnVerificationStatus && (
                  <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg p-3">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">BVN Verification</p>
                      <p className={`text-xs font-medium mt-0.5 capitalize ${
                        sub.bvnVerificationStatus === "verified" ? "text-emerald-400" :
                        sub.bvnVerificationStatus === "failed" ? "text-red-400" : "text-amber-400"
                      }`}>{sub.bvnVerificationStatus}</p>
                    </div>
                    {sub.duplicateFlag && (
                      <div className="ml-auto flex items-center gap-1 text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Duplicate Detected</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Documents</h4>
                <div className="space-y-2">
                  {sub.documentUrl && (
                    <button
                      onClick={() => setLightboxUrl(sub.documentUrl)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-800/60 rounded-lg hover:bg-slate-800 transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200">Identity Document</p>
                        <p className="text-xs text-slate-500 truncate">{sub.documentUrl.split("/").pop()}</p>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                  {sub.selfieUrl && (
                    <button
                      onClick={() => setLightboxUrl(sub.selfieUrl)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-800/60 rounded-lg hover:bg-slate-800 transition-colors text-left"
                    >
                      <Camera className="w-4 h-4 text-violet-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200">Selfie / Liveness Photo</p>
                        <p className="text-xs text-slate-500 truncate">{sub.selfieUrl.split("/").pop()}</p>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                  {!sub.documentUrl && !sub.selfieUrl && (
                    <p className="text-xs text-slate-500 italic">No documents uploaded yet</p>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Details</h4>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: "Merchant ID", value: sub.merchantId },
                    { label: "Submitted", value: sub.createdAt ? new Date(sub.createdAt).toLocaleString("en-NG") : "—" },
                    { label: "Reviewed At", value: sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleString("en-NG") : "—" },
                    { label: "Reviewed By", value: sub.reviewedBy ?? "—" },
                    { label: "Rejection Reason", value: sub.rejectionReason ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-slate-500 w-28 shrink-0">{label}</span>
                      <span className="text-slate-300 font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Override note */}
              {sub.livenessOverride && sub.livenessOverrideNote && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-purple-400 mb-1">Liveness Override Note</p>
                  <p className="text-xs text-purple-300/80">{sub.livenessOverrideNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminKYCReview() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    id: number;
    decision: "approved" | "rejected";
    livenessScore?: number | null;
    livenessOverride?: boolean | null;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [livenessOverride, setLivenessOverride] = useState(false);
  const [livenessOverrideNote, setLivenessOverrideNote] = useState("");

  const utils = trpc.useUtils();
  const statsQuery = trpc.admin.kyc.getStats.useQuery();
  const listQuery = trpc.admin.kyc.listPending.useQuery(
    { page, limit: 20, status: statusFilter },
    { staleTime: 30_000 }
  );

  const reviewMutation = trpc.admin.kyc.reviewSubmission.useMutation({
    onSuccess: async () => {
      if (reviewDialog && livenessOverride && livenessOverrideNote.trim().length >= 10) {
        await overrideLivenessMutation.mutateAsync({
          submissionId: reviewDialog.id,
          override: true,
          note: livenessOverrideNote.trim(),
        });
      }
      utils.admin.kyc.listPending.invalidate();
      utils.admin.kyc.getStats.invalidate();
      closeDialog();
      toast.success("KYC submission reviewed — merchant has been notified");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const overrideLivenessMutation = trpc.complianceKyc.overrideLiveness.useMutation({
    onError: (e: any) => toast.error(`Liveness override failed: ${e.message}`),
  });

  const stats = statsQuery.data as Record<string, number> | null | undefined;
  const submissions = (listQuery.data as any)?.submissions ?? [];
  const total = (listQuery.data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    approved: "bg-green-500/20 text-green-400 border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const closeDialog = () => {
    setReviewDialog(null);
    setNotes("");
    setLivenessOverride(false);
    setLivenessOverrideNote("");
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            KYC / KYB Review Queue
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Review, approve, or reject merchant identity verification submissions. Merchants are notified immediately upon decision.
          </p>
        </div>

        {/* Stats */}
        {statsQuery.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 bg-slate-800 rounded-xl" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pending Review", val: stats.pending ?? 0, color: "text-amber-400", icon: AlertTriangle },
              { label: "Approved", val: stats.approved ?? 0, color: "text-emerald-400", icon: CheckCircle },
              { label: "Rejected", val: stats.rejected ?? 0, color: "text-red-400", icon: XCircle },
              { label: "Total", val: Object.values(stats).reduce((a, b) => a + b, 0), color: "text-slate-300", icon: ShieldCheck },
            ].map(({ label, val, color, icon: Icon }) => (
              <Card key={label} className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-2xl font-bold ${color}`}>{val}</p>
                    <Icon className={`w-5 h-5 ${color} opacity-60`} />
                  </div>
                  <p className="text-xs text-slate-500">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Submissions table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Submissions
                {total > 0 && <span className="text-slate-500 text-sm font-normal">({total})</span>}
              </CardTitle>
              <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  {["all", "pending", "approved", "rejected"].map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400">Doc Type</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Liveness</TableHead>
                    <TableHead className="text-slate-400">Face Match</TableHead>
                    <TableHead className="text-slate-400">BVN</TableHead>
                    <TableHead className="text-slate-400">Submitted</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s: any) => (
                    <TableRow
                      key={s.id}
                      className="border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => setDetailId(s.id)}
                    >
                      <TableCell className="text-slate-400 text-xs font-mono">{s.id}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono max-w-[120px] truncate">{s.merchantId?.slice(0, 12)}…</TableCell>
                      <TableCell className="text-slate-300 text-sm capitalize">{s.docType?.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${statusColors[s.status] ?? "bg-slate-700 text-slate-300"}`}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell><ScoreBar value={s.livenessScore} /></TableCell>
                      <TableCell><ScoreBar value={s.faceMatchScore} /></TableCell>
                      <TableCell>
                        {s.bvnVerificationStatus ? (
                          <span className={`text-xs capitalize ${
                            s.bvnVerificationStatus === "verified" ? "text-emerald-400" :
                            s.bvnVerificationStatus === "failed" ? "text-red-400" : "text-amber-400"
                          }`}>{s.bvnVerificationStatus}</span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {new Date(s.createdAt).toLocaleDateString("en-NG")}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        {s.status === "pending" && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => setReviewDialog({ open: true, id: s.id, decision: "approved", livenessScore: s.livenessScore, livenessOverride: s.livenessOverride })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
                              onClick={() => setReviewDialog({ open: true, id: s.id, decision: "rejected", livenessScore: s.livenessScore, livenessOverride: s.livenessOverride })}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                        {s.status !== "pending" && (
                          <button
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                            onClick={() => setDetailId(s.id)}
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {submissions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-slate-500 py-10">
                        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No submissions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700 text-slate-300" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700 text-slate-300" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail side panel */}
      {detailId != null && (
        <SubmissionDetailPanel submissionId={detailId} onClose={() => setDetailId(null)} />
      )}

      {/* Approve / Reject Dialog */}
      {reviewDialog && (
        <Dialog open={reviewDialog.open} onOpenChange={closeDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {reviewDialog.decision === "approved"
                  ? <CheckCircle className="w-5 h-5 text-green-400" />
                  : <XCircle className="w-5 h-5 text-red-400" />}
                {reviewDialog.decision === "approved" ? "Approve" : "Reject"} Submission #{reviewDialog.id}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Notification info banner */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-300/80">
                  The merchant will receive an <strong>in-app notification and real-time alert</strong> immediately after this decision is submitted.
                </p>
              </div>

              {/* Liveness score warnings */}
              {isBorderline(reviewDialog.livenessScore) && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-400">Borderline Liveness Score</p>
                    <p className="text-xs text-amber-300/80 mt-0.5">
                      Score: {reviewDialog.livenessScore != null ? (reviewDialog.livenessScore * 100).toFixed(1) : "—"}% (threshold: 90%). If approving, enable the liveness override below with a mandatory audit note.
                    </p>
                  </div>
                </div>
              )}
              {isLow(reviewDialog.livenessScore) && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-400">Low Liveness Score</p>
                    <p className="text-xs text-red-300/80 mt-0.5">
                      Score: {reviewDialog.livenessScore != null ? (reviewDialog.livenessScore * 100).toFixed(1) : "—"}% — below minimum threshold. Approval requires a liveness override with detailed justification.
                    </p>
                  </div>
                </div>
              )}

              {/* Review notes */}
              <div>
                <Label className="text-slate-300">
                  Review Notes {reviewDialog.decision === "rejected" && <span className="text-red-400">*</span>}
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e: any) => setNotes(e.target.value)}
                  placeholder={reviewDialog.decision === "rejected" ? "Reason for rejection (required)…" : "Optional notes for audit trail…"}
                  className="mt-1 bg-slate-800 border-slate-700 text-white"
                  rows={3}
                />
              </div>

              {/* Liveness override toggle */}
              {reviewDialog.decision === "approved" &&
                (isBorderline(reviewDialog.livenessScore) || isLow(reviewDialog.livenessScore)) && (
                <div className="space-y-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-200 text-sm">Liveness Override</Label>
                      <p className="text-xs text-slate-400 mt-0.5">Manually accept despite low liveness score</p>
                    </div>
                    <Switch
                      checked={livenessOverride}
                      onCheckedChange={setLivenessOverride}
                      className="data-[state=checked]:bg-purple-600"
                    />
                  </div>
                  {livenessOverride && (
                    <div>
                      <Label className="text-slate-300 text-xs">
                        Override Justification <span className="text-red-400">*</span> (min 10 chars)
                      </Label>
                      <Textarea
                        value={livenessOverrideNote}
                        onChange={(e: any) => setLivenessOverrideNote(e.target.value)}
                        placeholder="e.g. Physical document verified in-person by compliance officer…"
                        className="mt-1 bg-slate-700 border-slate-600 text-white text-xs"
                        rows={3}
                      />
                      {livenessOverrideNote.length > 0 && livenessOverrideNote.length < 10 && (
                        <p className="text-xs text-red-400 mt-1">{10 - livenessOverrideNote.length} more characters required</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                className={reviewDialog.decision === "approved"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"}
                disabled={
                  reviewMutation.isPending ||
                  overrideLivenessMutation.isPending ||
                  (reviewDialog.decision === "rejected" && !notes.trim()) ||
                  (reviewDialog.decision === "approved" && livenessOverride && livenessOverrideNote.trim().length < 10)
                }
                onClick={() => reviewMutation.mutate({
                  submissionId: reviewDialog.id,
                  decision: reviewDialog.decision,
                  notes: notes || undefined,
                })}
              >
                {reviewMutation.isPending
                  ? "Processing…"
                  : `Confirm ${reviewDialog.decision === "approved" ? "Approval" : "Rejection"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
