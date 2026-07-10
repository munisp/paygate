import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Send, Ban, RefreshCw, Eye, CheckCircle2, Clock, XCircle, Users, Activity, Key, AlertTriangle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>;
  if (status === "inactive") return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Inactive</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function SessionBadge({ hasSession, hasPending }: { hasSession: boolean; hasPending: boolean }) {
  if (hasSession) return <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1"><Activity className="w-3 h-3" /> Online</Badge>;
  if (hasPending) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1"><Clock className="w-3 h-3" /> Link Pending</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-slate-200 gap-1"><XCircle className="w-3 h-3" /> No Access</Badge>;
}

export default function RegulatorManagement() {
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [selectedRegulatorId, setSelectedRegulatorId] = useState<string | null>(null);
  const [selectedRegulatorName, setSelectedRegulatorName] = useState<string>("");

  const { data: stats } = trpc.adminRegulators.getStats.useQuery();
  const { data: regulators, isLoading, refetch } = trpc.adminRegulators.list.useQuery();
  const { data: auditLog } = trpc.adminRegulators.getMagicLinkAudit.useQuery(
    { regulatorId: selectedRegulatorId!, limit: 20 },
    { enabled: !!selectedRegulatorId && auditDialogOpen }
  );

  const sendMagicLink = trpc.adminRegulators.sendMagicLink.useMutation({
    onSuccess: (data) => {
      toast.success(`Access link sent to ${data.email}`);
      if (data.magicLink) toast.info(`Dev link: ${data.magicLink}`, { duration: 15000 });
      setSendDialogOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeAccess = trpc.adminRegulators.revokeAccess.useMutation({
    onSuccess: (data) => {
      toast.success(`Access revoked for ${data.regulatorName}: ${data.revokedSessions} session(s), ${data.invalidatedTokens} token(s) invalidated`);
      setRevokeDialogOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Regulator Access Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage magic-link access for regulatory oversight portal users</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, color: "blue", value: stats.totalRegulators, label: "Total Regulators" },
            { icon: CheckCircle2, color: "emerald", value: stats.activeRegulators, label: "Active" },
            { icon: Activity, color: "indigo", value: stats.activeSessions, label: "Active Sessions" },
            { icon: Key, color: "amber", value: stats.pendingTokens, label: "Pending Tokens" },
          ].map(({ icon: Icon, color, value, label }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Icon className={`w-8 h-8 text-${color}-600 bg-${color}-50 rounded-lg p-1.5`} />
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Onboarded Regulators</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regulator</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading regulators...</TableCell></TableRow>
              )}
              {!isLoading && (!regulators || regulators.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No regulators onboarded yet.</TableCell></TableRow>
              )}
              {regulators?.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{reg.regulatorName}</p>
                      <p className="text-xs text-muted-foreground">{reg.regulatorCode}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{reg.jurisdiction}</Badge></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground capitalize">{reg.regulatoryType?.replace(/_/g, " ")}</span></TableCell>
                  <TableCell><span className="text-xs font-mono">{reg.contactEmail ?? "—"}</span></TableCell>
                  <TableCell><StatusBadge status={reg.status} /></TableCell>
                  <TableCell><SessionBadge hasSession={reg.hasActiveSession} hasPending={reg.hasPendingToken} /></TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                        disabled={!reg.contactEmail || reg.status !== "active"}
                        onClick={() => { setSelectedRegulatorId(reg.id); setSelectedRegulatorName(reg.regulatorName); setSendDialogOpen(true); }}>
                        <Send className="w-3 h-3" /> Send Link
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-amber-600 hover:text-amber-700"
                        disabled={!reg.hasActiveSession && !reg.hasPendingToken}
                        onClick={() => { setSelectedRegulatorId(reg.id); setSelectedRegulatorName(reg.regulatorName); setRevokeDialogOpen(true); }}>
                        <Ban className="w-3 h-3" /> Revoke
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs"
                        onClick={() => { setSelectedRegulatorId(reg.id); setSelectedRegulatorName(reg.regulatorName); setAuditDialogOpen(true); }}>
                        <Eye className="w-3 h-3" /> Audit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Send Magic Link Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-blue-600" /> Send Access Link</DialogTitle>
            <DialogDescription>
              This will generate a secure 30-minute magic link and send it to the contact email for <strong>{selectedRegulatorName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Any previously sent unused links will remain valid until they expire.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => sendMagicLink.mutate({ regulatorId: selectedRegulatorId!, origin: window.location.origin })}
              disabled={sendMagicLink.isPending} className="gap-2">
              <Send className="w-4 h-4" />
              {sendMagicLink.isPending ? "Sending..." : "Send Access Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Access Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Ban className="w-5 h-5" /> Revoke Portal Access</DialogTitle>
            <DialogDescription>
              This will immediately terminate all active sessions and invalidate all pending magic links for <strong>{selectedRegulatorName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => revokeAccess.mutate({ regulatorId: selectedRegulatorId! })}
              disabled={revokeAccess.isPending} className="gap-2">
              <Ban className="w-4 h-4" />
              {revokeAccess.isPending ? "Revoking..." : "Revoke Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" /> Magic Link Audit — {selectedRegulatorName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Used At</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!auditLog || auditLog.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No magic links sent yet</TableCell></TableRow>
                ) : auditLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">{new Date(entry.createdAt!).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{new Date(entry.expiresAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{entry.usedAt ? new Date(entry.usedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>
                      {entry.status === "used" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Used</Badge>}
                      {entry.status === "pending" && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>}
                      {entry.status === "expired" && <Badge className="bg-slate-100 text-slate-600 border-slate-200">Expired</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
