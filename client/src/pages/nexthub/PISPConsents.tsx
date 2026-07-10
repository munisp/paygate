import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, UserCheck, XCircle, Clock, AlertTriangle, ChevronRight } from "lucide-react";

type ConsentState = "REQUESTED" | "GRANTED" | "ACTIVE" | "REVOKED" | "EXPIRED";

const STATE_CONFIG: Record<ConsentState, { color: string; icon: React.ReactNode }> = {
  REQUESTED: { color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", icon: <Clock className="w-3 h-3" /> },
  GRANTED: { color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: <UserCheck className="w-3 h-3" /> },
  ACTIVE: { color: "bg-green-500/20 text-green-300 border-green-500/30", icon: <ShieldCheck className="w-3 h-3" /> },
  REVOKED: { color: "bg-red-500/20 text-red-300 border-red-500/30", icon: <XCircle className="w-3 h-3" /> },
  EXPIRED: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: <AlertTriangle className="w-3 h-3" /> },
};

function StateBadge({ state }: { state: string }) {
  const cfg = STATE_CONFIG[state as ConsentState] ?? { color: "bg-gray-500/20 text-gray-300", icon: null };
  return (
    <Badge className={`${cfg.color} flex items-center gap-1`}>
      {cfg.icon}{state}
    </Badge>
  );
}

function ConsentDetail({ consentId, onClose }: { consentId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.nexthubPISP.getConsent.useQuery({ consentId });
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const revoke = trpc.nexthubPISP.revokeConsent.useMutation({
    onSuccess: () => {
      toast({ title: "Consent revoked" });
      utils.nexthubPISP.listConsents.invalidate();
      utils.nexthubPISP.stats.invalidate();
      onClose();
    },
    onError: (e) => toast({ title: "Revoke failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>PISP Consent Detail</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-gray-400 py-4">Loading...</p>
        ) : data ? (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">Consent ID</p>
                <p className="font-mono text-blue-300 text-xs mt-1 break-all">{data.consentId}</p>
              </div>
              <div>
                <p className="text-gray-400">State</p>
                <div className="mt-1"><StateBadge state={data.state} /></div>
              </div>
              <div>
                <p className="text-gray-400">PISP ID</p>
                <p className="text-white mt-1">{data.pispId}</p>
              </div>
              <div>
                <p className="text-gray-400">DFSP ID</p>
                <p className="text-white mt-1">{data.dfspId}</p>
              </div>
              <div>
                <p className="text-gray-400">Consumer ID</p>
                <p className="text-white mt-1 text-xs font-mono">{data.consumerId || "—"}</p>
              </div>
              <div>
                <p className="text-gray-400">Consent Request ID</p>
                <p className="text-white mt-1 text-xs font-mono">{data.consentRequestId || "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-2">Scopes</p>
              <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 max-h-32 overflow-y-auto">
                {data.scopes || "[]"}
              </div>
            </div>
            {data.authChannels && (
              <div>
                <p className="text-gray-400 text-sm mb-1">Auth Channels</p>
                <p className="text-white text-sm">{data.authChannels}</p>
              </div>
            )}
            {data.revokedAt && (
              <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm">
                <p className="text-red-400 font-medium">Revoked</p>
                <p className="text-gray-300 mt-1">At: {new Date(data.revokedAt).toLocaleString()}</p>
                {data.revokeReason && <p className="text-gray-300">Reason: {data.revokeReason}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div>Created: {data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</div>
              <div>Expires: {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : "Never"}</div>
            </div>
            {data.state !== "REVOKED" && data.state !== "EXPIRED" && (
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={revoke.isPending}
                onClick={() => revoke.mutate({ consentId: data.consentId, reason: "Revoked by operator" })}>
                {revoke.isPending ? "Revoking..." : "Revoke Consent"}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-red-400">Consent not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PISPConsents() {
  const [stateFilter, setStateFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: consents = [], isLoading } = trpc.nexthubPISP.listConsents.useQuery(
    stateFilter ? { state: stateFilter as ConsentState } : undefined
  );
  const { data: stats } = trpc.nexthubPISP.stats.useQuery();

  return (
    <div className="p-6 space-y-6 bg-gray-950 min-h-screen text-gray-100">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-indigo-400" />PISP Consents
        </h1>
        <p className="text-gray-400 text-sm mt-1">Third-party payment initiation (3PPI) consent management — FSPIOP v1.1</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">Total Consents</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{stats.byState?.ACTIVE ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{stats.byState?.REVOKED ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">Revoked</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-indigo-400">{stats.activePisps}</p>
              <p className="text-xs text-gray-400 mt-1">Active PISPs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* State filter pills */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byState ?? {}).map(([state, count]) => (
            <button key={state} onClick={() => setStateFilter(stateFilter === state ? "" : state)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-all ${
                stateFilter === state ? "border-indigo-500 bg-indigo-500/20" : "border-gray-700 bg-gray-800 hover:border-gray-600"
              }`}>
              <StateBadge state={state} />
              <span className="text-white font-semibold">{count as number}</span>
            </button>
          ))}
        </div>
      )}

      {/* Consents Table */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-white text-base">PISP Consent Registry</CardTitle>
          {stateFilter && (
            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => setStateFilter("")}>
              Clear filter
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading consents...</div>
          ) : consents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No PISP consents found.</p>
              <p className="text-sm mt-1">Consents appear here when PISPs initiate the consent flow via the FSPIOP API.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-3 px-2">Consent ID</th>
                    <th className="text-left py-3 px-2">PISP</th>
                    <th className="text-left py-3 px-2">DFSP</th>
                    <th className="text-left py-3 px-2">State</th>
                    <th className="text-left py-3 px-2">Created</th>
                    <th className="text-left py-3 px-2">Expires</th>
                    <th className="text-left py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => (
                    <tr key={c.consentId} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-2 font-mono text-xs text-blue-300">{c.consentId.slice(0, 16)}...</td>
                      <td className="py-3 px-2 text-gray-300">{c.pispId}</td>
                      <td className="py-3 px-2 text-gray-300">{c.dfspId}</td>
                      <td className="py-3 px-2"><StateBadge state={c.state} /></td>
                      <td className="py-3 px-2 text-gray-400 text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"}</td>
                      <td className="py-3 px-2 text-xs">
                        {c.expiresAt ? (
                          <span className={new Date(c.expiresAt) < new Date() ? "text-red-400" : "text-gray-400"}>
                            {new Date(c.expiresAt).toLocaleString()}
                          </span>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="py-3 px-2">
                        <Button size="sm" variant="ghost" className="text-indigo-400 hover:text-indigo-300 h-7 px-2"
                          onClick={() => setSelectedId(c.consentId)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && <ConsentDetail consentId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
