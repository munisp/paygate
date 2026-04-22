// @ts-nocheck
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, ChevronRight, FileText, CheckCircle, XCircle,
  Upload, Download, Eye, EyeOff, Loader2, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  accepted: "bg-gray-100 text-gray-700",
  withdrawn: "bg-gray-100 text-gray-500",
};

export default function AdminChargebacks() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.wave24.chargebacks.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit,
    offset: page * limit,
  });

  const updateStatusMutation = trpc.wave24.chargebacks.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Chargeback status updated");
      utils.wave24.chargebacks.list.invalidate();
      setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const openCount = items.filter(i => i.status === "open").length;
  const reviewCount = items.filter(i => i.status === "under_review").length;
  const totalAmountKobo = items.reduce((s, i) => s + i.amountKobo, 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6" /> Chargeback Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review, resolve, and manage payment disputes and chargebacks with evidence tracking
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">Total Chargebacks</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{openCount}</div>
              <div className="text-xs text-muted-foreground">Open</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{reviewCount}</div>
              <div className="text-xs text-muted-foreground">Under Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">₦{(totalAmountKobo / 100).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Disputed</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading chargebacks...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No chargebacks found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">ID</th>
                    <th className="text-left p-3 font-medium">Merchant</th>
                    <th className="text-left p-3 font-medium">Amount</th>
                    <th className="text-left p-3 font-medium">Reason</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Due Date</th>
                    <th className="text-left p-3 font-medium">Evidence</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(cb => (
                    <tr key={cb.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-xs">{cb.id.slice(0, 8)}...</td>
                      <td className="p-3 text-xs font-mono">{cb.merchantId.slice(0, 12)}...</td>
                      <td className="p-3 font-semibold">₦{(cb.amountKobo / 100).toLocaleString()}</td>
                      <td className="p-3 text-xs">{cb.reason.replace(/_/g, " ")}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[cb.status] ?? ""}`}>
                          {cb.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {cb.dueDate ? format(new Date(cb.dueDate), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="p-3">
                        {cb.evidenceSubmitted ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" />Submitted
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="w-3.5 h-3.5" />Pending
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedId(cb.id)}>
                          <ChevronRight className="w-3.5 h-3.5 mr-1" />Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      {selectedId && (
        <ChargebackDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={(id, status, notes) => updateStatusMutation.mutate({ id, status, notes })}
        />
      )}
    </AdminLayout>
  );
}

function ChargebackDetail({
  id, onClose, onUpdate,
}: {
  id: string;
  onClose: () => void;
  onUpdate: (id: string, status: string, notes?: string) => void;
}) {
  const { data } = trpc.wave24.chargebacks.get.useQuery({ id });
  const { data: evidenceData, refetch: refetchEvidence } = trpc.wave26.chargebackPdf.getEvidenceForViewer.useQuery(
    { chargebackId: id },
    { enabled: !!id }
  );
  const [notes, setNotes] = useState("");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10 MB.");
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF, JPEG, PNG, or WebP files are accepted.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chargebackId", id);
      const res = await fetch("/api/chargebacks/upload-evidence", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Evidence uploaded successfully");
      refetchEvidence();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!data) return null;

  const hasEvidence = !!evidenceData?.evidenceUrl;
  const isPdf = evidenceData?.evidenceFileName?.toLowerCase().endsWith(".pdf") ||
    evidenceData?.evidenceUrl?.includes(".pdf");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />Chargeback Detail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Core Details */}
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">₦{(data.amountKobo / 100).toLocaleString()}</span></div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[data.status] ?? ""}`}>
                {data.status.replace(/_/g, " ")}
              </span>
            </div>
            <div><span className="text-muted-foreground">Reason:</span> <span>{data.reason.replace(/_/g, " ")}</span></div>
            <div><span className="text-muted-foreground">Currency:</span> <span>{data.currency}</span></div>
            <div><span className="text-muted-foreground">Due:</span> <span>{data.dueDate ? format(new Date(data.dueDate), "MMM d, yyyy") : "—"}</span></div>
            <div>
              <span className="text-muted-foreground">Evidence:</span>{" "}
              <span>{data.evidenceSubmitted ? "✓ Submitted" : "Pending"}</span>
            </div>
          </div>

          {/* Evidence Section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 border-b">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span className="font-medium text-sm">Evidence Document</span>
                {evidenceData?.evidenceFileName && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    {evidenceData.evidenceFileName}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasEvidence && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => setShowPdfViewer(!showPdfViewer)}
                    >
                      {showPdfViewer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPdfViewer ? "Hide" : "Preview"}
                    </Button>
                    <a href={evidenceData.evidenceUrl!} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <Download className="w-3.5 h-3.5" />Download
                      </Button>
                    </a>
                    <a href={evidenceData.evidenceUrl!} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        <ExternalLink className="w-3.5 h-3.5" />Open
                      </Button>
                    </a>
                  </>
                )}
                {/* Upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleEvidenceUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {hasEvidence ? "Replace" : "Upload"}
                </Button>
              </div>
            </div>

            {/* Inline viewer */}
            {hasEvidence && showPdfViewer && (
              <div className="bg-gray-50">
                {isPdf ? (
                  <iframe
                    src={`${evidenceData.evidenceUrl}#toolbar=1&navpanes=0`}
                    className="w-full h-96 border-0"
                    title="Chargeback Evidence PDF"
                  />
                ) : (
                  <img
                    src={evidenceData.evidenceUrl!}
                    alt="Chargeback Evidence"
                    className="max-w-full max-h-96 mx-auto object-contain p-4"
                  />
                )}
              </div>
            )}

            {!hasEvidence && (
              <div className="p-6 text-center text-muted-foreground text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No evidence uploaded yet.</p>
                <p className="mt-1">Upload a PDF, JPEG, or PNG file (max 10 MB).</p>
              </div>
            )}
          </div>

          {/* Notes */}
          {data.notes && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs font-medium mb-1">Notes</div>
              <div className="text-xs">{data.notes}</div>
            </div>
          )}

          {/* Resolution Actions */}
          {["open", "under_review"].includes(data.status) && (
            <div className="space-y-3 border-t pt-3">
              <Label>Resolution Notes</Label>
              <Textarea
                placeholder="Add resolution notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onUpdate(id, "won", notes)}
                >
                  Mark Won
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onUpdate(id, "lost", notes)}
                >
                  Mark Lost
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdate(id, "accepted", notes)}
                >
                  Accept
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
