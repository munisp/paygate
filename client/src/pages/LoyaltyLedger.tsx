import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Gift, TrendingUp, TrendingDown, Search, RefreshCw } from "lucide-react";

export default function LoyaltyLedger() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    points: "",
    type: "earn",
    description: "",
  });

  const { data, isLoading, refetch } = trpc.orphanedTables.loyaltyLedger.list.useQuery({ limit: 200 }, { staleTime: 30_000 });

  const createMutation = trpc.orphanedTables.loyaltyLedger.create.useMutation({
    onSuccess: () => {
      toast.success("Loyalty entry created");
      setOpen(false);
      setForm({ accountId: "", points: "", type: "earn", description: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);

  const filtered = rows.filter((r: any) => {
    const q = search.toLowerCase();
    return (
      String(r.account_id ?? "").includes(q) ||
      String(r.type ?? "").toLowerCase().includes(q) ||
      String(r.description ?? "").toLowerCase().includes(q)
    );
  });

  const totalEarned = rows
    .filter((r: any) => r.type === "earn")
    .reduce((s: number, r: any) => s + Number(r.points ?? 0), 0);
  const totalRedeemed = rows
    .filter((r: any) => r.type === "redeem")
    .reduce((s: number, r: any) => s + Number(r.points ?? 0), 0);
  const netBalance = totalEarned - totalRedeemed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.points || !form.type) {
      toast.error("Account ID, points, and type are required");
      return;
    }
    createMutation.mutate({
      accountId: Number(form.accountId),
      points: Number(form.points),
      type: form.type,
      description: form.description || undefined,
    });
  };

  const typeColor = (t: string) => {
    switch (t) {
      case "earn": return "bg-green-100 text-green-800";
      case "redeem": return "bg-blue-100 text-blue-800";
      case "expire": return "bg-red-100 text-red-800";
      case "adjust": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loyalty Ledger</h1>
          <p className="text-muted-foreground text-sm">Track points earned, redeemed, and expired across all accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Loyalty Entry</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Account ID</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 1001"
                    value={form.accountId}
                    onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Points</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 500"
                    value={form.points}
                    onChange={(e) => setForm({ ...form, points: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earn">Earn</SelectItem>
                      <SelectItem value="redeem">Redeem</SelectItem>
                      <SelectItem value="expire">Expire</SelectItem>
                      <SelectItem value="adjust">Adjust</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="e.g. Purchase reward"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Entry"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" /> Total Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{totalEarned.toLocaleString()} pts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" /> Total Redeemed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{totalRedeemed.toLocaleString()} pts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Gift className="h-4 w-4 text-purple-500" /> Net Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{netBalance.toLocaleString()} pts</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by account, type, or description..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No loyalty entries found. Add the first entry above.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row: any, i: number) => (
                  <TableRow key={row.id ?? i}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell>{row.account_id}</TableCell>
                    <TableCell className="font-semibold">
                      {row.type === "earn" ? "+" : "-"}{Number(row.points ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={typeColor(row.type)}>{row.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.description ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
