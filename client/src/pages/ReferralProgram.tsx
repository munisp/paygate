import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Gift, TrendingUp, Plus, RefreshCw, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  completed: CheckCircle,
  expired: XCircle,
  cancelled: XCircle,
};

export default function ReferralProgram() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    referrerId: "",
    referrerRewardKobo: "50000",
    refereeRewardKobo: "25000",
    expiresAt: "",
  });

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.referrals.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: stats } = trpc.referrals.stats.useQuery();

  const createMutation = trpc.referrals.create.useMutation({
    onSuccess: () => {
      toast.success("Referral created successfully");
      setShowCreate(false);
      setForm({ referrerId: "", referrerRewardKobo: "50000", refereeRewardKobo: "25000", expiresAt: "" });
      utils.referrals.list.invalidate();
      utils.referrals.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const completeMutation = trpc.referrals.complete.useMutation({
    onSuccess: () => {
      toast.success("Referral marked as completed");
      utils.referrals.list.invalidate();
      utils.referrals.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!form.referrerId) return toast.error("Referrer ID is required");
    createMutation.mutate({
      referrerId: Number(form.referrerId),
      referrerRewardKobo: Number(form.referrerRewardKobo),
      refereeRewardKobo: Number(form.refereeRewardKobo),
      expiresAt: form.expiresAt || undefined,
    });
  };

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Referral Program</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage merchant referral codes and reward payouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Referral
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Referrals", value: stats?.total ?? 0, icon: Users, color: "text-blue-600" },
          { label: "Completed", value: stats?.completed ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Pending", value: stats?.pending ?? 0, icon: Clock, color: "text-yellow-600" },
          { label: "Total Rewards Paid", value: formatKobo(stats?.totalRewardsKobo ?? 0), icon: Gift, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {data?.total ?? 0} total referrals
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load referrals. Please try again.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading referrals…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Referrer ID</TableHead>
                  <TableHead>Referee ID</TableHead>
                  <TableHead>Referrer Reward</TableHead>
                  <TableHead>Referee Reward</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No referrals found
                    </TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => {
                  const StatusIcon = STATUS_ICONS[r.status] ?? Clock;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm font-semibold">{r.referralCode}</TableCell>
                      <TableCell>{r.referrerId}</TableCell>
                      <TableCell>{r.refereeId ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{formatKobo(r.referrerRewardKobo)}</TableCell>
                      <TableCell>{formatKobo(r.refereeRewardKobo)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                          <StatusIcon className="w-3 h-3" />
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => completeMutation.mutate({ referralCode: r.referralCode, refereeId: r.refereeId ?? 0 })}
                            disabled={completeMutation.isPending}
                          >
                            Complete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(data.total / limit)}
          </span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Referrer User ID</Label>
              <Input
                type="number"
                placeholder="e.g. 1001"
                value={form.referrerId}
                onChange={(e) => setForm((f) => ({ ...f, referrerId: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Referrer Reward (Kobo)</Label>
                <Input
                  type="number"
                  value={form.referrerRewardKobo}
                  onChange={(e) => setForm((f) => ({ ...f, referrerRewardKobo: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{formatKobo(Number(form.referrerRewardKobo))}</p>
              </div>
              <div>
                <Label>Referee Reward (Kobo)</Label>
                <Input
                  type="number"
                  value={form.refereeRewardKobo}
                  onChange={(e) => setForm((f) => ({ ...f, refereeRewardKobo: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{formatKobo(Number(form.refereeRewardKobo))}</p>
              </div>
            </div>
            <div>
              <Label>Expires At (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Referral"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
