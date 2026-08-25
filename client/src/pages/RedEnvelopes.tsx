// @ts-nocheck
/**
 * RedEnvelopes.tsx
 *
 * Red Envelope (Hongbao) gifting feature — merchants can create and distribute
 * digital red envelopes funded from their wallet. Consumers claim them via QR or link.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gift, Plus, Users, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";

export default function RedEnvelopes() {
  const [page, setPage] = useState(0);
  const limit = 20;
  const [createOpen, setCreateOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [count, setCount] = useState("10");
  const [message, setMessage] = useState("Happy New Year! 🧧");
  const [expiresInDays, setExpiresInDays] = useState("7");

  const { data, isLoading, isError, refetch } = trpc.redEnvelopes.list.useQuery({ limit, offset: page * limit }, { staleTime: 30_000 });
  const { data: stats, isError: statsError } = trpc.redEnvelopes.stats.useQuery();

  const createMutation = trpc.redEnvelopes.create.useMutation({
    onSuccess: () => {
      toast.success("Red envelope campaign created!");
      setCreateOpen(false);
      setTotalAmount("");
      setCount("10");
      setMessage("Happy New Year! 🧧");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const statusColor = (s: string) => {
    if (s === "active") return "bg-green-100 text-green-800";
    if (s === "exhausted") return "bg-gray-100 text-gray-600";
    if (s === "expired") return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-800";
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gift className="w-6 h-6 text-red-500" /> Red Envelopes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Create and distribute digital hongbao to customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Stats */}
      {(isError || statsError) && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load data. Please refresh.
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Campaigns</p>
              <p className="text-2xl font-bold">{stats.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Claimed</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalClaimed ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Disbursed</p>
              <p className="text-2xl font-bold">{stats.totalDisbursedKobo ? formatNaira(stats.totalDisbursedKobo) : "₦0"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-500" /> Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading campaigns…</div>
          ) : !data?.envelopes?.length ? (
            <div className="text-center py-12">
              <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No red envelope campaigns yet.</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Create First Campaign
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3">Message</th>
                    <th className="text-right py-2 px-3">Total Amount</th>
                    <th className="text-right py-2 px-3">Count</th>
                    <th className="text-right py-2 px-3">Claimed</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {data.envelopes.map((env: any) => (
                    <tr key={env.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium">{env.message ?? "—"}</td>
                      <td className="py-2 px-3 text-right">{formatNaira(env.totalAmountKobo)}</td>
                      <td className="py-2 px-3 text-right">{env.count}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          {env.claimedCount ?? 0}/{env.count}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={statusColor(env.status)}>{env.status}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {env.expiresAt ? new Date(env.expiresAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={!data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Red Envelope Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Total Amount (₦)</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Amount in Naira to distribute across all envelopes</p>
            </div>
            <div>
              <Label>Number of Envelopes</Label>
              <Input
                type="number"
                placeholder="e.g. 10"
                value={count}
                onChange={e => setCount(e.target.value)}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Input
                placeholder="Happy New Year! 🧧"
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label>Expires In (days)</Label>
              <Input
                type="number"
                placeholder="7"
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!totalAmount || isNaN(Number(totalAmount))) {
                  toast.error("Enter a valid amount");
                  return;
                }
                createMutation.mutate({
                  // Server contract (wave124 redEnvelopes.create): sender is
                  // resolved from the session; client sends totalAmountKobo,
                  // slots (max 100), optional message, expiresInHours (1-168)
                  // and a REQUIRED idempotency key.
                  totalAmountKobo: Math.round(Number(totalAmount) * 100),
                  slots: Math.min(100, Math.max(1, Number(count) || 10)),
                  message,
                  expiresInHours: Math.min(168, Math.max(1, Math.round((Number(expiresInDays) || 7) * 24))),
                  idempotencyKey: crypto.randomUUID(),
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
