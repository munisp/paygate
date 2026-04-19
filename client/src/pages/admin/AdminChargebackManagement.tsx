import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, XCircle, Clock, DollarSign, FileText } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  evidence_submitted: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-700",
};

export default function AdminChargebackManagement() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [evidenceText, setEvidenceText] = useState("");

  const { data: chargebacks, refetch } = trpc.wave29.chargebackMgmt.list.useQuery({ limit: 50 });
  const { data: stats } = trpc.wave29.chargebackMgmt.getStats.useQuery();

  const submitEvidence = trpc.wave29.chargebackMgmt.submitEvidence.useMutation({
    onSuccess: () => { toast.success("Evidence submitted"); setSelectedId(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateStatus = trpc.wave29.chargebackMgmt.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const totalAmount = (chargebacks ?? []).reduce(
    (sum: number, c: any) => sum + Number(c.amount ?? 0), 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chargeback Management</h1>
        <p className="text-gray-500 mt-1">Track and respond to payment chargebacks and disputes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(chargebacks ?? []).filter((c: any) => c.status === "received" || c.status === "under_review").length}
                </p>
                <p className="text-sm text-gray-500">Open</p>
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
                  {(chargebacks ?? []).filter((c: any) => c.status === "won").length}
                </p>
                <p className="text-sm text-gray-500">Won</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(chargebacks ?? []).filter((c: any) => c.status === "lost").length}
                </p>
                <p className="text-sm text-gray-500">Lost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">₦{(totalAmount / 100).toLocaleString()}</p>
                <p className="text-sm text-gray-500">Total at Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chargebacks Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chargeback ID</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(chargebacks ?? []).map((c: any) => {
                const deadline = c.response_deadline ? new Date(c.response_deadline) : null;
                const isUrgent = deadline && deadline < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.chargeback_ref}</TableCell>
                    <TableCell className="font-mono text-xs">{c.transaction_ref}</TableCell>
                    <TableCell>₦{(Number(c.amount) / 100).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{c.reason?.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[c.status] ?? ""}>{c.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      {deadline ? (
                        <span className={isUrgent ? "text-red-600 font-medium" : "text-gray-600"}>
                          {deadline.toLocaleDateString()}
                          {isUrgent && " ⚠️"}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(c.status === "received" || c.status === "under_review") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedId(c.id)}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Evidence
                          </Button>
                        )}
                        {c.status === "evidence_submitted" && (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => updateStatus.mutate({ chargebackId: c.id, status: "won" })}
                            >
                              Won
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateStatus.mutate({ chargebackId: c.id, status: "lost" })}
                            >
                              Lost
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(chargebacks ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No chargebacks on record.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Evidence Dialog */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Chargeback Evidence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Evidence / Response</Label>
              <Textarea
                value={evidenceText}
                onChange={e => setEvidenceText(e.target.value)}
                placeholder="Describe the evidence supporting your case (transaction logs, delivery confirmation, customer communication, etc.)"
                rows={5}
              />
            </div>
            <Button
              className="w-full"
              disabled={!evidenceText || submitEvidence.isPending}
              onClick={() => submitEvidence.mutate({
                chargebackId: selectedId!,
                evidence: evidenceText,
              })}
            >
              Submit Evidence
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
