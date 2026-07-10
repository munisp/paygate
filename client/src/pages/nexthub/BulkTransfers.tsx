import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Layers, CheckCircle, XCircle, Clock, AlertTriangle, ChevronRight } from "lucide-react";

type BulkState = "RECEIVED" | "PENDING" | "ACCEPTED" | "PROCESSING" | "COMPLETED" | "REJECTED";

const STATE_COLORS: Record<BulkState, string> = {
  RECEIVED: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  ACCEPTED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  PROCESSING: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  COMPLETED: "bg-green-500/20 text-green-300 border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATE_ICONS: Record<BulkState, React.ReactNode> = {
  RECEIVED: <Clock className="w-3 h-3" />,
  PENDING: <Clock className="w-3 h-3" />,
  ACCEPTED: <CheckCircle className="w-3 h-3" />,
  PROCESSING: <AlertTriangle className="w-3 h-3" />,
  COMPLETED: <CheckCircle className="w-3 h-3" />,
  REJECTED: <XCircle className="w-3 h-3" />,
};

function StateBadge({ state }: { state: string }) {
  const s = state as BulkState;
  return (
    <Badge className={`${STATE_COLORS[s] ?? "bg-gray-500/20 text-gray-300"} flex items-center gap-1`}>
      {STATE_ICONS[s]}
      {state}
    </Badge>
  );
}

function ProgressBar({ completed, failed, total }: { completed: number; failed: number; total: number }) {
  if (total === 0) return <div className="h-2 bg-gray-700 rounded-full" />;
  const completedPct = (completed / total) * 100;
  const failedPct = (failed / total) * 100;
  return (
    <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
      <div className="h-full bg-green-500 transition-all" style={{ width: `${completedPct}%` }} />
      <div className="h-full bg-red-500 transition-all" style={{ width: `${failedPct}%` }} />
    </div>
  );
}

function BulkTransferDetail({ bulkTransferId, onClose }: { bulkTransferId: string; onClose: () => void }) {
  const { data, isLoading } = trpc.nexthubBulkTransfers.getById.useQuery({ bulkTransferId });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Transfer Detail</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-gray-400 py-4">Loading...</p>
        ) : data ? (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">Bulk Transfer ID</p>
                <p className="font-mono text-blue-300 text-xs mt-1 break-all">{data.bulkTransferId}</p>
              </div>
              <div>
                <p className="text-gray-400">State</p>
                <div className="mt-1"><StateBadge state={data.state} /></div>
              </div>
              <div>
                <p className="text-gray-400">Payer FSP</p>
                <p className="text-white mt-1">{data.payerFsp}</p>
              </div>
              <div>
                <p className="text-gray-400">Payee FSP</p>
                <p className="text-white mt-1">{data.payeeFsp}</p>
              </div>
              <div>
                <p className="text-gray-400">Total Transfers</p>
                <p className="text-white font-bold mt-1">{data.totalTransfers}</p>
              </div>
              <div>
                <p className="text-gray-400">Completed</p>
                <p className="text-green-400 font-bold mt-1">{data.completedTransfers}</p>
              </div>
              <div>
                <p className="text-gray-400">Failed</p>
                <p className="text-red-400 font-bold mt-1">{data.failedTransfers}</p>
              </div>
              <div>
                <p className="text-gray-400">Error Code</p>
                <p className="text-white mt-1">{data.errorCode ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-2">Progress</p>
              <ProgressBar completed={data.completedTransfers ?? 0} failed={data.failedTransfers ?? 0} total={data.totalTransfers ?? 0} />
              <p className="text-xs text-gray-500 mt-1">
                {data.completedTransfers ?? 0} completed · {data.failedTransfers ?? 0} failed · {(data.totalTransfers ?? 0) - (data.completedTransfers ?? 0) - (data.failedTransfers ?? 0)} pending
              </p>
            </div>
            {data.expiration && (
              <div>
                <p className="text-gray-400 text-sm">Expiration</p>
                <p className="text-white text-sm mt-1">{new Date(data.expiration).toLocaleString()}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div>Created: {data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</div>
              <div>Updated: {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}</div>
            </div>
          </div>
        ) : (
          <p className="text-red-400">Bulk transfer not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BulkTransfers() {
  const [stateFilter, setStateFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: transfers = [], isLoading } = trpc.nexthubBulkTransfers.list.useQuery(
    stateFilter ? { state: stateFilter as BulkState } : undefined
  );
  const { data: stats } = trpc.nexthubBulkTransfers.stats.useQuery();

  return (
    <div className="p-6 space-y-6 bg-gray-950 min-h-screen text-gray-100">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layers className="w-6 h-6 text-purple-400" />Bulk Transfers
        </h1>
        <p className="text-gray-400 text-sm mt-1">FSPIOP v1.1 bulk transfer tracking and monitoring</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">Total Batches</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{stats.totalIndividual}</p>
              <p className="text-xs text-gray-400 mt-1">Total Transfers</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{stats.completedIndividual}</p>
              <p className="text-xs text-gray-400 mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{stats.failedIndividual}</p>
              <p className="text-xs text-gray-400 mt-1">Failed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* State breakdown */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byState).map(([state, count]) => (
            <button key={state} onClick={() => setStateFilter(stateFilter === state ? "" : state)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-all ${
                stateFilter === state ? "border-purple-500 bg-purple-500/20" : "border-gray-700 bg-gray-800 hover:border-gray-600"
              }`}>
              <StateBadge state={state} />
              <span className="text-white font-semibold">{count as number}</span>
            </button>
          ))}
        </div>
      )}

      {/* Transfers Table */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-white text-base">Bulk Transfer Batches</CardTitle>
          {stateFilter && (
            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => setStateFilter("")}>
              Clear filter
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No bulk transfers found.</p>
              <p className="text-sm mt-1">Bulk transfers appear here when received via the FSPIOP API.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-3 px-2">Bulk Transfer ID</th>
                    <th className="text-left py-3 px-2">Payer FSP</th>
                    <th className="text-left py-3 px-2">Payee FSP</th>
                    <th className="text-left py-3 px-2">State</th>
                    <th className="text-left py-3 px-2">Progress</th>
                    <th className="text-left py-3 px-2">Created</th>
                    <th className="text-left py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.bulkTransferId} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-2 font-mono text-xs text-blue-300">{t.bulkTransferId.slice(0, 16)}...</td>
                      <td className="py-3 px-2 text-gray-300">{t.payerFsp}</td>
                      <td className="py-3 px-2 text-gray-300">{t.payeeFsp}</td>
                      <td className="py-3 px-2"><StateBadge state={t.state} /></td>
                      <td className="py-3 px-2 min-w-[120px]">
                        <ProgressBar completed={t.completedTransfers ?? 0} failed={t.failedTransfers ?? 0} total={t.totalTransfers ?? 0} />
                        <p className="text-xs text-gray-500 mt-1">{t.completedTransfers}/{t.totalTransfers}</p>
                      </td>
                      <td className="py-3 px-2 text-gray-400 text-xs">{t.createdAt ? new Date(t.createdAt).toLocaleString() : "—"}</td>
                      <td className="py-3 px-2">
                        <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 h-7 px-2"
                          onClick={() => setSelectedId(t.bulkTransferId)}>
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

      {selectedId && <BulkTransferDetail bulkTransferId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
