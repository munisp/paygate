import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Upload, MessageSquare, Clock, CheckCircle, AlertTriangle, FileText, Send, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const MOCK_DISPUTE = {
  id: "DIS-001",
  transactionId: "TXN-8823991",
  amount: "₦45,000.00",
  customer: "Emeka Okonkwo",
  reason: "Item not received",
  status: "evidence_required",
  dueDate: "2024-03-25",
  createdAt: "2024-03-10",
  bankRef: "VISA-CHB-20240310-001",
  timeline: [
    { date: "2024-03-10", event: "Chargeback initiated by customer", actor: "Customer Bank", type: "info" },
    { date: "2024-03-10", event: "Dispute case opened in PayGate", actor: "System", type: "info" },
    { date: "2024-03-11", event: "Evidence submission window opened (15 days)", actor: "System", type: "warning" },
  ],
};

export default function DisputeWorkflow() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dispute = MOCK_DISPUTE;

  const statusColor: Record<string, string> = {
    evidence_required: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    under_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    won: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    lost: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  const handleSubmitEvidence = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    setSubmitting(false);
    toast.success("Evidence submitted successfully. Your case is now under review.");
  };

  const handleSubmitNote = () => {
    if (!note.trim()) return;
    toast.success("Note added to dispute timeline");
    setNote("");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="text-zinc-400 hover:text-white p-2" onClick={() => navigate("/disputes")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Dispute {dispute.id}</h1>
            <Badge className={`border ${statusColor[dispute.status]}`}>
              {dispute.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-zinc-400 text-sm mt-1">Transaction {dispute.transactionId} · {dispute.amount} · {dispute.customer}</p>
        </div>
      </div>

      {/* Alert Banner */}
      {dispute.status === "evidence_required" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-300 font-medium">Evidence Required by {dispute.dueDate}</p>
            <p className="text-red-400/70 text-sm">Submit proof of delivery, customer communication, or refund records to contest this chargeback. Missing the deadline will result in automatic loss.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Evidence Upload */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" />
                Submit Evidence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400">Upload documents to support your case. Accepted: proof of delivery, signed receipts, customer communication, refund confirmation.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Proof of Delivery", icon: "📦", uploaded: false },
                  { label: "Customer Communication", icon: "💬", uploaded: false },
                  { label: "Refund Record", icon: "💳", uploaded: false },
                  { label: "Order Confirmation", icon: "📋", uploaded: false },
                ].map((item, i) => (
                  <div key={i} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${item.uploaded ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-amber-500/40 hover:bg-amber-500/5"}`}
                    onClick={() => toast.info("File upload coming soon — connect S3 storage")}>
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <p className="text-xs text-zinc-400">{item.label}</p>
                    {item.uploaded ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto mt-2" />
                    ) : (
                      <p className="text-xs text-zinc-600 mt-1">Click to upload</p>
                    )}
                  </div>
                ))}
              </div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={handleSubmitEvidence} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Evidence to Bank"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Add Note */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                Add Internal Note
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note for your team about this dispute..."
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                rows={3}
              />
              <Button size="sm" className="bg-zinc-700 hover:bg-zinc-600 text-white" onClick={handleSubmitNote}>
                <Send className="w-3 h-3 mr-2" /> Add Note
              </Button>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Dispute Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dispute.timeline.map((event, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${event.type === "warning" ? "bg-amber-400" : "bg-zinc-500"}`} />
                      {i < dispute.timeline.length - 1 && <div className="w-px flex-1 bg-zinc-800 mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm text-white">{event.event}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{event.actor} · {event.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Dispute Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Case ID", value: dispute.id },
                { label: "Transaction ID", value: dispute.transactionId },
                { label: "Amount", value: dispute.amount },
                { label: "Customer", value: dispute.customer },
                { label: "Reason", value: dispute.reason },
                { label: "Bank Reference", value: dispute.bankRef },
                { label: "Opened", value: dispute.createdAt },
                { label: "Evidence Due", value: dispute.dueDate },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-white font-mono text-xs">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 justify-start text-sm" onClick={() => toast.info("Refund issued")}>
                💸 Issue Refund
              </Button>
              <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 justify-start text-sm" onClick={() => toast.info("Escalated to compliance team")}>
                🚨 Escalate to Compliance
              </Button>
              <Button variant="outline" className="w-full border-red-900/50 text-red-400 hover:bg-red-900/20 justify-start text-sm" onClick={() => toast.info("Dispute accepted — funds will be returned to customer")}>
                ✓ Accept Dispute
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
