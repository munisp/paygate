// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Plus, RefreshCw, Clock, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { useForm, Controller } from "react-hook-form";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  under_review: "bg-blue-100 text-blue-800",
  resolved_merchant: "bg-green-100 text-green-800",
  resolved_consumer: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-700",
  escalated: "bg-red-100 text-red-800",
};

const DISPUTE_REASONS = [
  "Unauthorized transaction",
  "Item not received",
  "Item not as described",
  "Duplicate charge",
  "Subscription cancelled but charged",
  "Incorrect amount charged",
  "Service not provided",
  "Other",
];

export default function ConsumerDisputeFiling() {
  const [showNew, setShowNew] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm();

  const { data, isLoading, refetch } = trpc.wave27.consumerDisputes.list.useQuery();

  const fileMutation = trpc.wave27.consumerDisputes.file.useMutation({
    onSuccess: () => { toast.success("Dispute filed successfully. We'll review it within 3-5 business days."); refetch(); setShowNew(false); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const disputes = data?.disputes ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Disputes</h1>
          <p className="text-gray-500 text-sm">File and track transaction disputes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/></Button>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />New Dispute</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <div className="text-xl font-bold text-yellow-600">{disputes.filter((d: any) => d.status === "open").length}</div>
          <div className="text-xs text-gray-500">Open</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{disputes.filter((d: any) => d.status === "under_review").length}</div>
          <div className="text-xs text-gray-500">Under Review</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-xl font-bold text-green-600">{disputes.filter((d: any) => d.status?.startsWith("resolved")).length}</div>
          <div className="text-xs text-gray-500">Resolved</div>
        </CardContent></Card>
      </div>

      {/* Disputes List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading disputes...</div>
      ) : disputes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No disputes filed yet</p>
            <Button className="mt-4" onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" />File a Dispute</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {disputes.map((d: any) => (
            <Card key={d.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedDispute(d)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{d.reason}</span>
                      <Badge className={STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-700"}>
                        {d.status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>Amount: ₦{Number(d.disputed_amount || 0).toLocaleString()}</span>
                      <span>Filed: {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}</span>
                    </div>
                  </div>
                  <MessageSquare className="w-5 h-5 text-gray-400 ml-3 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Dispute Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>File a New Dispute</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((data) => fileMutation.mutate(data as any))} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Transaction Reference (optional)</label>
              <Input {...register("transactionRef")} placeholder="TXN-XXXXXXXX" />
            </div>
            <div>
              <label className="text-sm font-medium">Disputed Amount (₦)</label>
              <Input type="number" {...register("disputedAmount", { required: "Amount is required", min: 1 })} placeholder="5000" />
              {errors.disputedAmount && <p className="text-xs text-red-500 mt-1">{String(errors.disputedAmount.message)}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Controller name="reason" control={control} rules={{ required: "Reason is required" }} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                  <SelectContent>
                    {DISPUTE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {errors.reason && <p className="text-xs text-red-500 mt-1">{String(errors.reason.message)}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea {...register("description", { required: "Please describe the issue" })} placeholder="Please provide details about the dispute..." rows={3} />
              {errors.description && <p className="text-xs text-red-500 mt-1">{String(errors.description.message)}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button type="submit" disabled={fileMutation.isPending}>
                {fileMutation.isPending ? "Filing..." : "Submit Dispute"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dispute Detail Dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={() => setSelectedDispute(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dispute Details</DialogTitle></DialogHeader>
          {selectedDispute && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium text-gray-500">Status:</span>
                  <Badge className={`ml-2 ${STATUS_COLORS[selectedDispute.status] ?? ""}`}>{selectedDispute.status?.replace(/_/g, " ")}</Badge>
                </div>
                <div><span className="font-medium text-gray-500">Amount:</span> ₦{Number(selectedDispute.disputed_amount || 0).toLocaleString()}</div>
                <div className="col-span-2"><span className="font-medium text-gray-500">Reason:</span> {selectedDispute.reason}</div>
                <div className="col-span-2"><span className="font-medium text-gray-500">Description:</span> {selectedDispute.description}</div>
                {selectedDispute.resolution_note && (
                  <div className="col-span-2 p-3 bg-green-50 rounded border border-green-200">
                    <div className="font-medium text-green-800 text-xs mb-1">Resolution Note</div>
                    <div className="text-sm text-green-700">{selectedDispute.resolution_note}</div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                Filed {selectedDispute.created_at ? new Date(selectedDispute.created_at).toLocaleString() : "—"}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDispute(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
