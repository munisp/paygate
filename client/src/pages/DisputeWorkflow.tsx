import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Upload, MessageSquare, Clock, CheckCircle, AlertTriangle, Send, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type EvidenceFile = { label: string; icon: string; url: string | null; name: string | null };

export default function DisputeWorkflow() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadIdx, setActiveUploadIdx] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([
    { label: "Proof of Delivery", icon: "📦", url: null, name: null },
    { label: "Customer Communication", icon: "💬", url: null, name: null },
    { label: "Refund Record", icon: "💳", url: null, name: null },
    { label: "Order Confirmation", icon: "📋", url: null, name: null },
  ]);

  const { data, isLoading } = trpc.disputes.get.useQuery(
    { id: params.id! },
    { enabled: !!params.id, staleTime: 30_000 }
  );

  const escalateMutation = trpc.disputes.escalate.useMutation({
    onSuccess: () => { utils.disputes.list.invalidate(); utils.disputes.get.invalidate({ id: params.id! }); toast.success("Dispute escalated to compliance team."); },
    onError: (e: any) => toast.error(e.message),
  });
  const acceptMutation = trpc.disputes.accept.useMutation({
    onSuccess: () => { utils.disputes.list.invalidate(); utils.disputes.get.invalidate({ id: params.id! }); toast.success("Dispute accepted — funds will be returned to customer."); navigate("/disputes"); },
    onError: (e: any) => toast.error(e.message),
  });
  const respondMutation = trpc.disputes.respond.useMutation({
    onSuccess: () => {
      utils.disputes.list.invalidate();
      utils.disputes.get.invalidate({ id: params.id! });
      toast.success("Evidence submitted. Your case is now under review.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFileClick = (idx: number) => {
    setActiveUploadIdx(idx);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeUploadIdx === null) return;
    e.target.value = "";
    setUploadingIdx(activeUploadIdx);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setEvidenceFiles(prev => prev.map((f: any, i: any) => i === activeUploadIdx ? { ...f, url, name: file.name } : f));
      toast.success(`${file.name} uploaded`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingIdx(null);
      setActiveUploadIdx(null);
    }
  };

  const handleSubmitEvidence = () => {
    const uploaded = evidenceFiles.filter(f => f.url);
    if (uploaded.length === 0) {
      toast.error("Please upload at least one evidence file");
      return;
    }
    const evidence = Object.fromEntries(uploaded.map(f => [f.label, f.url!]));
    respondMutation.mutate({
      id: params.id!,
      merchantResponse: note || "Evidence submitted via portal",
      evidence,
    });
  };

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    toast.success("Note added to dispute timeline");
    setNote("");
  };

  const statusColor: Record<string, string> = {
    evidence_required: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    under_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    won: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    lost: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/disputes")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
        <div className="text-center py-20 text-muted-foreground">Dispute not found</div>
      </div>
    );
  }

  const dispute = data;

  return (
    <div className="p-6 space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileChange} />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="p-2" onClick={() => navigate("/disputes")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Dispute {dispute.id.slice(0, 12)}
            </h1>
            <Badge className={`border ${statusColor[dispute.status] ?? ""}`}>
              {dispute.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {dispute.transactionId} · {dispute.currency} {(dispute.amount / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Alert Banner */}
      {dispute.status === "open" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-amber-700 font-medium">Evidence Required</p>
            <p className="text-amber-600/80 text-sm">Submit proof of delivery, customer communication, or refund records to contest this chargeback.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Evidence Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-500" />
                Submit Evidence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload documents to support your case. Accepted: PDF, JPG, PNG, DOC (max 16 MB each).</p>
              <div className="grid grid-cols-2 gap-3">
                {evidenceFiles.map((item, i) => (
                  <div
                    key={i}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                      item.url
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-border hover:border-amber-500/40 hover:bg-amber-500/5"
                    }`}
                    onClick={() => !uploadingIdx && handleFileClick(i)}
                  >
                    {uploadingIdx === i ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground mx-auto mb-2 animate-spin" />
                    ) : (
                      <div className="text-2xl mb-2">{item.icon}</div>
                    )}
                    <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                    {item.url ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto mt-2" />
                        <p className="text-xs text-emerald-600 mt-1 truncate">{item.name}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 mt-1">Click to upload</p>
                    )}
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={handleSubmitEvidence}
                disabled={respondMutation.isPending || evidenceFiles.every(f => !f.url)}
              >
                {respondMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                ) : (
                  <>Submit Evidence to Bank <ChevronRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Add Note */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Add Internal Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note for your team about this dispute..."
                className="resize-none"
                rows={3}
              />
              <Button size="sm" variant="outline" onClick={handleSubmitNote} disabled={!note.trim()}>
                <Send className="w-3 h-3 mr-2" /> Add Note
              </Button>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Dispute Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { date: new Date(dispute.createdAt).toLocaleDateString(), event: "Dispute case opened", actor: "System", type: "info" },
                  ...(dispute.merchantResponse ? [{ date: new Date(dispute.updatedAt ?? dispute.createdAt).toLocaleDateString(), event: `Merchant response: ${dispute.merchantResponse.slice(0, 80)}`, actor: "Merchant", type: "info" }] : []),
                ].map((event, i, arr) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${event.type === "warning" ? "bg-amber-400" : "bg-muted-foreground"}`} />
                      {i < arr.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm text-foreground">{event.event}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{event.actor} · {event.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dispute Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Case ID", value: dispute.id.slice(0, 16) },
                { label: "Transaction ID", value: dispute.transactionId?.slice(0, 16) ?? "—" },
                { label: "Amount", value: `${dispute.currency} ${(dispute.amount / 100).toLocaleString()}` },
                { label: "Reason", value: dispute.reason ?? "—" },
                { label: "Status", value: dispute.status.replace("_", " ") },
                { label: "Opened", value: new Date(dispute.createdAt).toLocaleDateString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="text-foreground font-mono text-xs text-right truncate">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-sm" onClick={() => navigate("/payouts")}>
                💸 Issue Refund
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm" onClick={() => escalateMutation.mutate({ id: params.id!, reason: 'Escalated to compliance team by merchant' })} disabled={escalateMutation.isPending}>
                {escalateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                🚨 Escalate to Compliance
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm text-destructive hover:text-destructive" onClick={() => acceptMutation.mutate({ id: params.id! })} disabled={acceptMutation.isPending}>
                {acceptMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                ✓ Accept Dispute
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
