import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Shield, Search, RefreshCw, CheckCircle2, AlertTriangle, DollarSign } from "lucide-react";

export default function EscrowContracts() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    buyerEmail: "",
    sellerEmail: "",
    amount: "",
    currency: "NGN",
    description: "",
    expiresAt: "",
  });

  const { data, isLoading, refetch } = trpc.orphanedTables.escrowContracts.list.useQuery({ limit: 200 });

  const createMutation = trpc.orphanedTables.escrowContracts.create.useMutation({
    onSuccess: () => {
      toast.success("Escrow contract created");
      setOpen(false);
      setForm({ buyerEmail: "", sellerEmail: "", amount: "", currency: "NGN", description: "", expiresAt: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const releaseMutation = trpc.orphanedTables.escrowContracts.release.useMutation({
    onSuccess: () => { toast.success("Funds released to seller"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const disputeMutation = trpc.orphanedTables.escrowContracts.dispute.useMutation({
    onSuccess: () => { toast.success("Dispute raised"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);

  const filtered = rows.filter((r: any) => {
    const q = search.toLowerCase();
    return (
      String(r.buyer_email ?? "").toLowerCase().includes(q) ||
      String(r.seller_email ?? "").toLowerCase().includes(q) ||
      String(r.description ?? "").toLowerCase().includes(q) ||
      String(r.status ?? "").toLowerCase().includes(q)
    );
  });

  const totalHeld = rows
    .filter((r: any) => r.status === "funded")
    .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.buyerEmail || !form.sellerEmail || !form.amount || !form.description) {
      toast.error("All required fields must be filled");
      return;
    }
    createMutation.mutate({
      buyerEmail: form.buyerEmail,
      sellerEmail: form.sellerEmail,
      amount: Number(form.amount),
      currency: form.currency,
      description: form.description,
      expiresAt: form.expiresAt || undefined,
    });
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      funded: "bg-blue-100 text-blue-800",
      released: "bg-green-100 text-green-800",
      disputed: "bg-red-100 text-red-800",
      expired: "bg-gray-100 text-gray-600",
      cancelled: "bg-gray-100 text-gray-600",
    };
    return <Badge className={map[s] ?? "bg-gray-100 text-gray-600"}>{s}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" /> Escrow Contracts
          </h1>
          <p className="text-muted-foreground text-sm">Manage buyer-seller escrow agreements with lifecycle controls</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Escrow Contract</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Buyer Email *</Label>
                    <Input
                      type="email"
                      placeholder="buyer@example.com"
                      value={form.buyerEmail}
                      onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Seller Email *</Label>
                    <Input
                      type="email"
                      placeholder="seller@example.com"
                      value={form.sellerEmail}
                      onChange={(e) => setForm({ ...form, sellerEmail: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 50000"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Input
                      placeholder="NGN"
                      maxLength={3}
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Description *</Label>
                  <Input
                    placeholder="e.g. Purchase of electronics"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Expires At (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Contract"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" /> Funds Held
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {totalHeld.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        {["pending", "funded", "released", "disputed"].map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground capitalize">{status}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{rows.filter((r: any) => r.status === status).length}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by buyer, seller, description, or status..."
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
                <TableHead>Buyer</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No escrow contracts found. Create the first contract above.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row: any, i: number) => (
                  <TableRow key={row.id ?? i}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell className="text-sm">{row.buyer_email}</TableCell>
                    <TableCell className="text-sm">{row.seller_email}</TableCell>
                    <TableCell className="font-semibold">
                      {Number(row.amount ?? 0).toLocaleString()} {row.currency}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{row.description}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {row.status === "funded" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => releaseMutation.mutate({ id: row.id })}
                              disabled={releaseMutation.isPending}
                              className="text-green-700 border-green-300 hover:bg-green-50"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Release
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disputeMutation.mutate({ id: row.id, reason: "Dispute raised by merchant" })}
                              disabled={disputeMutation.isPending}
                              className="text-red-700 border-red-300 hover:bg-red-50"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" /> Dispute
                            </Button>
                          </>
                        )}
                      </div>
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
