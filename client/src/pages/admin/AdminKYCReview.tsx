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
import { ShieldCheck, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminKYCReview() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
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
  const listQuery = trpc.admin.kyc.listPending.useQuery({ page, limit: 20, status: statusFilter }, { staleTime: 30_000 });

  const reviewMutation = trpc.admin.kyc.reviewSubmission.useMutation({
    onSuccess: async () => {
      // If liveness override was set, persist it
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
      toast.success("KYC submission reviewed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const overrideLivenessMutation = trpc.complianceKyc.overrideLiveness.useMutation({
    onError: (e: any) => toast.error(`Liveness override failed: ${e.message}`),
  });

  const stats = statsQuery.data as Record<string, number> | null | undefined;
  const submissions = (listQuery.data as any)?.submissions ?? [];

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

  // A borderline score is between 0.70 and 0.89 — needs reviewer attention
  const isBorderlineScore = (score: number | null | undefined) =>
    score != null && score >= 0.70 && score < 0.90;

  const isLowScore = (score: number | null | undefined) =>
    score != null && score < 0.70;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            KYC Review Queue
          </h1>
          <p className="text-slate-400 text-sm mt-1">Review and approve merchant KYC submissions</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pending", val: stats.pending ?? 0, color: "text-amber-400" },
              { label: "Approved", val: stats.approved ?? 0, color: "text-green-400" },
              { label: "Rejected", val: stats.rejected ?? 0, color: "text-red-400" },
              { label: "Total", val: stats.total ?? 0, color: "text-slate-300" },
            ].map(s => (
              <Card key={s.label} className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-3">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Submissions
              </CardTitle>
              <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v as any); setPage(1); }}>
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
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Merchant ID</TableHead>
                    <TableHead className="text-slate-400">Doc Type</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Liveness</TableHead>
                    <TableHead className="text-slate-400">Override</TableHead>
                    <TableHead className="text-slate-400">Submitted</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s: any) => (
                    <TableRow key={s.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-400 text-xs font-mono">{s.id}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{s.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-slate-300 text-sm capitalize">{s.docType?.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${statusColors[s.status] ?? "bg-slate-700 text-slate-300"}`}>{s.status}</Badge>
                      </TableCell>
                      {/* Liveness score with color-coded bar */}
                      <TableCell>
                        {s.livenessScore != null ? (
                          <div className="flex items-center gap-1.5">
                            {isLowScore(s.livenessScore) && (
                              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                            )}
                            <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  s.livenessScore >= 0.9 ? 'bg-emerald-500' :
                                  s.livenessScore >= 0.7 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(s.livenessScore * 100).toFixed(0)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-mono ${
                              s.livenessScore >= 0.9 ? 'text-emerald-400' :
                              s.livenessScore >= 0.7 ? 'text-amber-400' : 'text-red-400'
                            }`}>{(s.livenessScore * 100).toFixed(1)}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </TableCell>
                      {/* Override indicator */}
                      <TableCell>
                        {s.livenessOverride ? (
                          <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30" title={s.livenessOverrideNote ?? ''}>
                            Overridden
                          </Badge>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-right">
                        {s.status === "pending" && (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => setReviewDialog({ open: true, id: s.id, decision: "approved", livenessScore: s.livenessScore, livenessOverride: s.livenessOverride })}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
                              aria-label="Close" onClick={() => setReviewDialog({ open: true, id: s.id, decision: "rejected", livenessScore: s.livenessScore, livenessOverride: s.livenessOverride })}><X/> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {submissions.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No submissions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve / Reject Dialog */}
      {reviewDialog && (
        <Dialog open={reviewDialog.open} onOpenChange={closeDialog}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle>{reviewDialog.decision === "approved" ? "Approve" : "Reject"} KYC Submission #{reviewDialog.id}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Liveness score warning banner */}
              {isBorderlineScore(reviewDialog.livenessScore) && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-400">Borderline Liveness Score</p>
                    <p className="text-xs text-amber-300/80 mt-0.5">
                      Score is {reviewDialog.livenessScore != null ? (reviewDialog.livenessScore * 100).toFixed(1) : '—'}% (threshold: 90%). If approving, enable the liveness override below and provide a mandatory audit note.
                    </p>
                  </div>
                </div>
              )}
              {isLowScore(reviewDialog.livenessScore) && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-400">Low Liveness Score</p>
                    <p className="text-xs text-red-300/80 mt-0.5">
                      Score is {reviewDialog.livenessScore != null ? (reviewDialog.livenessScore * 100).toFixed(1) : '—'}% — below the minimum threshold. Approval requires a liveness override with a detailed justification.
                    </p>
                  </div>
                </div>
              )}

              {/* Review notes */}
              <div>
                <Label className="text-slate-300">Review Notes {reviewDialog.decision === "rejected" && <span className="text-red-400">*</span>}</Label>
                <Textarea
                  value={notes}
                  onChange={(e: any) => setNotes(e.target.value)}
                  placeholder={reviewDialog.decision === "rejected" ? "Reason for rejection (required)..." : "Optional notes for audit trail..."}
                  className="mt-1 bg-slate-800 border-slate-700 text-white"
                  rows={3}
                />
              </div>

              {/* Liveness override toggle — shown when score is borderline or low and decision is approve */}
              {reviewDialog.decision === "approved" &&
                (isBorderlineScore(reviewDialog.livenessScore) || isLowScore(reviewDialog.livenessScore)) && (
                <div className="space-y-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-200 text-sm">Liveness Override</Label>
                      <p className="text-xs text-slate-400 mt-0.5">Manually accept this submission despite the low liveness score</p>
                    </div>
                    <Switch
                      checked={livenessOverride}
                      onCheckedChange={setLivenessOverride}
                      className="data-[state=checked]:bg-purple-600"
                    />
                  </div>
                  {livenessOverride && (
                    <div>
                      <Label className="text-slate-300 text-xs">Override Justification <span className="text-red-400">*</span> (min 10 chars)</Label>
                      <Textarea
                        value={livenessOverrideNote}
                        onChange={(e: any) => setLivenessOverrideNote(e.target.value)}
                        placeholder="e.g. Physical document verified in-person by compliance officer on 2026-04-16. Customer has medical condition affecting blink detection."
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
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={closeDialog}>Cancel</Button>
              <Button
                className={reviewDialog.decision === "approved" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
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
                {reviewMutation.isPending ? "Processing…" : `Confirm ${reviewDialog.decision === "approved" ? "Approval" : "Rejection"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
