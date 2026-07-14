// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, CheckCircle2, XCircle, Clock, Eye, FileText, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type VerificationStatus = "pending" | "approved" | "rejected" | "under_review";

const STATUS_CONFIG: Record<VerificationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  under_review: { label: "Under Review", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export default function MerchantVerification() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | "all">("all");
  const [selectedMerchant, setSelectedMerchant] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: verifications, refetch, isLoading } = trpc.wave223.merchantVerification.list.useQuery({
    search,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const approveMutation = trpc.wave223.merchantVerification.approve.useMutation({
    onSuccess: () => { toast.success("Merchant approved."); setSelectedMerchant(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.wave223.merchantVerification.reject.useMutation({
    onSuccess: () => { toast.success("Merchant rejected."); setSelectedMerchant(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const startReviewMutation = trpc.wave223.merchantVerification.startReview.useMutation({
    onSuccess: () => { toast.success("Review started."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const counts = {
    pending: verifications?.filter((v) => v.status === "pending").length ?? 0,
    under_review: verifications?.filter((v) => v.status === "under_review").length ?? 0,
    approved: verifications?.filter((v) => v.status === "approved").length ?? 0,
    rejected: verifications?.filter((v) => v.status === "rejected").length ?? 0,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Merchant Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">Review and approve merchant KYC submissions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.entries(counts) as [VerificationStatus, number][]).map(([status, count]) => (
          <Card
            key={status}
            className={`border-0 bg-muted/40 cursor-pointer transition-all ${statusFilter === status ? "ring-2 ring-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
          >
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{status.replace(/_/g, ' ')}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search merchant name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Verification list */}
      <div className="space-y-3">
        {isLoading && <p className="text-center text-muted-foreground py-8">Loading…</p>}
        {!isLoading && !verifications?.length && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No verification requests found.</CardContent></Card>
        )}
        {verifications?.map((v) => {
          const cfg = STATUS_CONFIG[v.status as VerificationStatus] ?? STATUS_CONFIG.pending;
          return (
            <Card key={v.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{v.merchantName ?? "Unknown Merchant"}</p>
                  <p className="text-xs text-muted-foreground">
                    ID: {v.merchantId} · Submitted: {v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : "N/A"}
                    {v.documentCount ? ` · ${v.documentCount} documents` : ""}
                  </p>
                  {v.reviewNotes && <p className="text-xs text-muted-foreground italic mt-0.5">"{v.reviewNotes}"</p>}
                </div>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setSelectedMerchant(v); setReviewNotes(""); }}>
                    <Eye className="h-4 w-4 mr-1" /> Review
                  </Button>
                  {v.status === "pending" && (
                    <Button variant="secondary" size="sm" onClick={() => startReviewMutation.mutate({ merchantId: v.merchantId })}>
                      Start Review
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Review dialog */}
      <Dialog open={!!selectedMerchant} onOpenChange={(o) => !o && setSelectedMerchant(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Review: {selectedMerchant?.merchantName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Merchant ID</p><p className="font-mono font-medium">{selectedMerchant?.merchantId}</p></div>
              <div><p className="text-muted-foreground">Status</p><Badge variant={STATUS_CONFIG[selectedMerchant?.status as VerificationStatus]?.variant ?? "secondary"}>{selectedMerchant?.status}</Badge></div>
              <div><p className="text-muted-foreground">Documents</p><p className="font-medium">{selectedMerchant?.documentCount ?? 0} uploaded</p></div>
              <div><p className="text-muted-foreground">Submitted</p><p className="font-medium">{selectedMerchant?.submittedAt ? new Date(selectedMerchant.submittedAt).toLocaleDateString() : "N/A"}</p></div>
            </div>
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea
                placeholder="Add review notes (required for rejection)…"
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedMerchant(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || !reviewNotes}
              onClick={() => rejectMutation.mutate({ merchantId: selectedMerchant.merchantId, notes: reviewNotes })}
            >
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ merchantId: selectedMerchant.merchantId, notes: reviewNotes })}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
