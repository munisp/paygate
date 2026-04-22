// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, FileText } from "lucide-react";

const KYB_STATES = [
  { id: "pending", label: "Pending", color: "bg-gray-100 text-gray-700" },
  { id: "documents_requested", label: "Docs Requested", color: "bg-blue-100 text-blue-700" },
  { id: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-700" },
  { id: "additional_info", label: "Info Needed", color: "bg-orange-100 text-orange-700" },
  { id: "approved", label: "Approved", color: "bg-green-100 text-green-700" },
  { id: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
  { id: "suspended", label: "Suspended", color: "bg-purple-100 text-purple-700" },
];

const TRANSITIONS: Record<string, string[]> = {
  pending: ["documents_requested", "under_review"],
  documents_requested: ["under_review", "rejected"],
  under_review: ["approved", "rejected", "additional_info"],
  additional_info: ["under_review", "rejected"],
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved", "rejected"],
};

export default function KybStateMachine() {
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [targetState, setTargetState] = useState("");

  const { data: submissions, refetch } = trpc.wave30.kybStateMachine.listSubmissions.useQuery({
    status: filterState || undefined,
    search: search || undefined,
    limit: 100,
  });

  const { data: auditLog } = trpc.wave30.kybStateMachine.getAuditLog.useQuery(
    { merchantId: selected?.merchant_id },
    { enabled: !!selected?.merchant_id }
  );

  const transition = trpc.wave30.kybStateMachine.transition.useMutation({
    onSuccess: () => {
      toast.success(`KYB status updated to ${targetState}`);
      setSelected(null);
      setTransitionNote("");
      setTargetState("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const requestDocs = trpc.wave30.kybStateMachine.requestDocuments.useMutation({
    onSuccess: () => { toast.success("Document request sent"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const availableTransitions = selected ? (TRANSITIONS[selected.status] ?? []) : [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYB State Machine</h1>
          <p className="text-gray-500 text-sm mt-1">Know Your Business lifecycle management with full audit trail</p>
        </div>
      </div>

      {/* State Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">KYB Lifecycle States</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {KYB_STATES.map((state, i) => (
              <div key={state.id} className="flex items-center gap-2">
                <Badge className={`${state.color} text-xs px-3 py-1`}>{state.label}</Badge>
                {i < KYB_STATES.length - 1 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Transitions are governed by business rules. Rejected applications can be resubmitted.</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3">
        <Input placeholder="Search by business name or email..." className="max-w-sm"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="border rounded px-3 py-2 text-sm text-gray-700"
          value={filterState} onChange={(e) => setFilterState(e.target.value)}>
          <option value="">All States</option>
          {KYB_STATES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Submissions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!submissions?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No KYB submissions found
                  </TableCell>
                </TableRow>
              ) : submissions.map((sub: any) => {
                const state = KYB_STATES.find((s) => s.id === sub.status);
                return (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium text-sm">{sub.business_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600">{sub.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${state?.color ?? 'bg-gray-100 text-gray-700'}`}>
                        {state?.label ?? sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.risk_score != null ? (
                        <span className={`font-semibold text-sm ${sub.risk_score > 70 ? 'text-red-600' : sub.risk_score > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {sub.risk_score}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {sub.updated_at ? new Date(sub.updated_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => { setSelected(sub); setTargetState(""); }}>
                          <FileText className="w-3 h-3 mr-1" /> Review
                        </Button>
                        {sub.status === 'pending' && (
                          <Button size="sm" variant="outline" className="text-xs text-blue-700 border-blue-300"
                            onClick={() => requestDocs.mutate({ merchantId: sub.merchant_id })}>
                            Request Docs
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Transition Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>KYB Review — {selected?.business_name ?? "Merchant"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-500">Current State</p>
                  <Badge className={`${KYB_STATES.find(s => s.id === selected.status)?.color ?? ''} text-xs`}>
                    {selected.status}
                  </Badge>
                </div>
                <div><p className="text-gray-500">Risk Score</p>
                  <p className="font-semibold">{selected.risk_score ?? "—"}</p></div>
                <div><p className="text-gray-500">Business Type</p>
                  <p className="font-medium">{selected.business_type ?? "—"}</p></div>
                <div><p className="text-gray-500">Registration #</p>
                  <p className="font-mono text-xs">{selected.registration_number ?? "—"}</p></div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Transition To</p>
                <div className="flex gap-2 flex-wrap">
                  {availableTransitions.map((state) => {
                    const s = KYB_STATES.find((k) => k.id === state);
                    return (
                      <Button key={state} size="sm" variant="outline"
                        className={`text-xs ${targetState === state ? 'ring-2 ring-indigo-500' : ''}`}
                        onClick={() => setTargetState(state)}>
                        {s?.label ?? state}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Review Note</p>
                <Textarea placeholder="Add review notes, reason for decision..."
                  value={transitionNote} onChange={(e) => setTransitionNote(e.target.value)} rows={3} />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={!targetState}
                  onClick={() => transition.mutate({
                    merchantId: selected.merchant_id,
                    newStatus: targetState,
                    note: transitionNote,
                  })}>
                  Apply Transition
                </Button>
              </div>

              {/* Audit Log */}
              {auditLog && auditLog.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Audit Trail</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {auditLog.map((log: any) => (
                      <div key={log.id} className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded">
                        <span className="text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                        <span className="font-medium">{log.from_status} → {log.to_status}</span>
                        {log.note && <span className="text-gray-500 truncate">{log.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
