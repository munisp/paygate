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
import { Plus, Leaf, Search, RefreshCw, CheckCircle2 } from "lucide-react";

export default function CarbonCreditsLedger() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    projectName: "",
    vintage: "",
    certificationBody: "",
  });

  const { data, isLoading, refetch } = trpc.orphanedTables.carbonCredits.list.useQuery({ limit: 200 });

  const createMutation = trpc.orphanedTables.carbonCredits.create.useMutation({
    onSuccess: () => {
      toast.success("Carbon credit created");
      setOpen(false);
      setForm({ amount: "", projectName: "", vintage: "", certificationBody: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const retireMutation = trpc.orphanedTables.carbonCredits.retire.useMutation({
    onSuccess: () => {
      toast.success("Carbon credit retired");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);

  const filtered = rows.filter((r: any) => {
    const q = search.toLowerCase();
    return (
      String(r.project_name ?? "").toLowerCase().includes(q) ||
      String(r.certification_body ?? "").toLowerCase().includes(q) ||
      String(r.status ?? "").toLowerCase().includes(q)
    );
  });

  const totalActive = rows.filter((r: any) => r.status === "active").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const totalRetired = rows.filter((r: any) => r.status === "retired").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.projectName) {
      toast.error("Amount and project name are required");
      return;
    }
    createMutation.mutate({
      amount: Number(form.amount),
      projectName: form.projectName,
      vintage: form.vintage ? Number(form.vintage) : undefined,
      certificationBody: form.certificationBody || undefined,
    });
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "active": return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case "retired": return <Badge className="bg-gray-100 text-gray-600">Retired</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Leaf className="h-6 w-6 text-green-600" /> Carbon Credits
          </h1>
          <p className="text-muted-foreground text-sm">Manage carbon offset credits — issue, track, and retire credits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Issue Credit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Issue Carbon Credit</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Amount (tCO₂e)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 100"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Project Name</Label>
                  <Input
                    placeholder="e.g. Mangrove Restoration Nigeria"
                    value={form.projectName}
                    onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Vintage Year (optional)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 2024"
                    value={form.vintage}
                    onChange={(e) => setForm({ ...form, vintage: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Certification Body (optional)</Label>
                  <Input
                    placeholder="e.g. Verra VCS, Gold Standard"
                    value={form.certificationBody}
                    onChange={(e) => setForm({ ...form, certificationBody: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Issuing..." : "Issue Credit"}
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{totalActive.toLocaleString()} tCO₂e</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Retired Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-500">{totalRetired.toLocaleString()} tCO₂e</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by project, certification body, or status..."
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
                <TableHead>Project Name</TableHead>
                <TableHead>Amount (tCO₂e)</TableHead>
                <TableHead>Vintage</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No carbon credits found. Issue the first credit above.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row: any, i: number) => (
                  <TableRow key={row.id ?? i}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell className="font-medium">{row.project_name}</TableCell>
                    <TableCell>{Number(row.amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{row.vintage ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.certification_body ?? "—"}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell>
                      {row.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retireMutation.mutate({ id: row.id })}
                          disabled={retireMutation.isPending}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Retire
                        </Button>
                      )}
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
