// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, ArrowUp, CheckCircle, Clock, FileText, Plus } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  escalated: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

export default function DisputeEscalation() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    transactionRef: "",
    category: "unauthorized_transaction",
    description: "",
    amountDisputed: 0,
  });
  const [escalateNote, setEscalateNote] = useState("");

  // Server exposes wave29.disputeEscalation.{getEscalated, getTimeline, escalate, resolve}.
  // There is no generic list/create here; escalated disputes come from getEscalated
  // and new disputes are filed via wave27.consumerDispute.fileDispute.
  const { data: disputes, refetch, isLoading } = trpc.wave29.disputeEscalation.getEscalated.useQuery(undefined, { staleTime: 30_000 });
  const { data: detail } = trpc.wave29.disputeEscalation.getTimeline.useQuery(
    { disputeId: String(selectedId!) },
    { enabled: !!selectedId , staleTime: 30_000 })

  const REASON_MAP: Record<string, string> = {
    unauthorized_transaction: "unauthorized",
    wrong_amount: "wrong_amount",
    duplicate_charge: "duplicate",
    service_not_received: "not_received",
    fraud: "merchant_fraud",
    other: "other",
  };

  const createDispute = trpc.wave27.consumerDispute.fileDispute.useMutation({
    onSuccess: () => { toast.success("Dispute filed"); setShowCreate(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const escalate = trpc.wave29.disputeEscalation.escalate.useMutation({
    onSuccess: () => { toast.success("Dispute escalated to senior review"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const resolve = trpc.wave29.disputeEscalation.resolve.useMutation({
    onSuccess: () => { toast.success("Dispute resolved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const open = (disputes ?? []).filter((d: any) => d.status === "open" || d.status === "under_review").length;
  const escalated = (disputes ?? []).filter((d: any) => d.status === "escalated").length;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispute Escalation</h1>
          <p className="text-gray-500 mt-1">File, track, and escalate consumer disputes through the resolution workflow</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              File Dispute
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>File New Dispute</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Transaction Reference</Label>
                <Input
                  value={form.transactionRef}
                  onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))}
                  placeholder="TXN-2026-001234"
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm mt-1"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  <option value="unauthorized_transaction">Unauthorized Transaction</option>
                  <option value="wrong_amount">Wrong Amount</option>
                  <option value="duplicate_charge">Duplicate Charge</option>
                  <option value="service_not_received">Service Not Received</option>
                  <option value="fraud">Fraud</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label>Amount Disputed (kobo)</Label>
                <Input
                  type="number"
                  value={form.amountDisputed}
                  onChange={e => setForm(f => ({ ...f, amountDisputed: parseInt(e.target.value) }))}
                />
                <p className="text-xs text-gray-400 mt-1">₦{(form.amountDisputed / 100).toLocaleString()}</p>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue in detail..."
                  rows={3}
                />
              </div>
              <Button
                className="w-full"
                disabled={!form.transactionRef || form.description.length < 10 || !form.amountDisputed || createDispute.isPending}
                onClick={() => createDispute.mutate({
                  transactionId: form.transactionRef,
                  reason: (REASON_MAP[form.category] ?? "other") as any,
                  description: form.description,
                  amount: form.amountDisputed / 100,
                  currency: "NGN",
                })}
              >
                Submit Dispute
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{open}</p>
                <p className="text-sm text-gray-500">Open / Under Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{escalated}</p>
                <p className="text-sm text-gray-500">Escalated</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(disputes ?? []).filter((d: any) => d.status === "resolved").length}
                </p>
                <p className="text-sm text-gray-500">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disputes Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(disputes ?? []).map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.transaction_ref ?? d.wallet_txn_id ?? d.id}</TableCell>
                  <TableCell className="text-sm">{(d.category ?? "").replace(/_/g, " ")}</TableCell>
                  <TableCell>₦{(Number(d.amount_disputed || 0) / 100).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={PRIORITY_COLORS[d.priority] ?? "bg-gray-100 text-gray-700"}>{d.priority ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[d.status] ?? ""}>{d.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(d.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(d.status === "open" || d.status === "under_review") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => escalate.mutate({
                            disputeId: String(d.id),
                            reason: "Escalated by admin",
                          })}
                        >
                          <ArrowUp className="w-3 h-3 mr-1" />
                          Escalate
                        </Button>
                      )}
                      {d.status === "escalated" && (
                        <Button
                          size="sm"
                          onClick={() => resolve.mutate({
                            disputeId: String(d.id),
                            resolution: "Resolved after investigation",
                            outcome: "full_refund",
                            refundAmount: Number(d.amount_disputed || 0) / 100,
                          })}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(disputes ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No disputes filed yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
