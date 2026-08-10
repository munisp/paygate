import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Copy, Ban, RefreshCw, Download } from "lucide-react";
import { format } from "date-fns";

const TYPE_COLORS: Record<string, string> = {
  merchant: "bg-blue-100 text-blue-800",
  partner: "bg-purple-100 text-purple-800",
  admin: "bg-red-100 text-red-800",
  consumer: "bg-green-100 text-green-800",
  team_member: "bg-yellow-100 text-yellow-800",
};

export default function AdminInviteCodesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({
    type: "merchant" as const,
    usesTotal: 1,
    expiresAt: "",
    tenantId: "",
  });
  const [bulkForm, setBulkForm] = useState({ count: 10, type: "merchant" as const, usesTotal: 1 });

  const { data, refetch, isLoading } = trpc.wave32.inviteCodes.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  }, { staleTime: 30_000 });

  const createMutation = trpc.wave32.inviteCodes.create.useMutation({
    onSuccess: () => { toast({ title: "Invite code created" }); setShowCreate(false); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkMutation = trpc.wave32.inviteCodes.bulkCreate.useMutation({
    onSuccess: (rows) => { toast({ title: `${rows.length} codes created` }); setShowBulk(false); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = trpc.wave32.inviteCodes.revoke.useMutation({
    onSuccess: () => { toast({ title: "Code revoked" }); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied to clipboard" });
  };

  const exportCsv = () => {
    if (!data?.items) return;
    const csv = [
      "Code,Type,Uses Remaining,Uses Total,Expires At,Revoked,Created At",
      ...data.items.map(c =>
        `${c.code},${c.type},${c.usesRemaining},${c.usesTotal},${c.expiresAt ?? ""},${c.isRevoked},${c.createdAt}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "invite-codes.csv"; a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invite Codes</h1>
          <p className="text-muted-foreground">Manage onboarding invite codes for merchants, partners, and consumers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" onClick={() => setShowBulk(true)}><RefreshCw className="h-4 w-4 mr-2" />Bulk Create</Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Code</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Codes", value: data?.total ?? 0 },
          { label: "Active", value: data?.items?.filter(c => !c.isRevoked && c.usesRemaining > 0).length ?? 0 },
          { label: "Fully Used", value: data?.items?.filter(c => c.usesRemaining === 0).length ?? 0 },
          { label: "Revoked", value: data?.items?.filter(c => c.isRevoked).length ?? 0 },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search codes..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="merchant">Merchant</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="consumer">Consumer</SelectItem>
            <SelectItem value="team_member">Team Member</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {["Code", "Type", "Uses", "Expires", "Status", "Created", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No invite codes found</td></tr>
              ) : data?.items?.map(code => (
                <tr key={code.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono font-semibold">{code.code}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[code.type] ?? ""}`}>{code.type}</span>
                  </td>
                  <td className="px-4 py-3">{code.usesRemaining} / {code.usesTotal}</td>
                  <td className="px-4 py-3">{code.expiresAt ? format(new Date(code.expiresAt), "MMM d, yyyy") : "Never"}</td>
                  <td className="px-4 py-3">
                    {code.isRevoked ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : code.usesRemaining === 0 ? (
                      <Badge variant="secondary">Used Up</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(code.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" aria-label="Copy" onClick={() => copyCode(code.code)}><Copy/></Button>
                      {!code.isRevoked && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeMutation.mutate({ id: code.id })}>
                          <Ban className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invite Code</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["merchant", "partner", "admin", "consumer", "team_member"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Uses</Label>
              <Input type="number" min={1} max={1000} value={form.usesTotal} onChange={e => setForm(f => ({ ...f, usesTotal: +e.target.value }))} />
            </div>
            <div>
              <Label>Expires At (optional)</Label>
              <Input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <div>
              <Label>Tenant ID (optional)</Label>
              <Input placeholder="ten_acme_pay" value={form.tenantId} onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, expiresAt: form.expiresAt || undefined, tenantId: form.tenantId || undefined })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Create Invite Codes</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Number of Codes</Label>
              <Input type="number" min={1} max={100} value={bulkForm.count} onChange={e => setBulkForm(f => ({ ...f, count: +e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={bulkForm.type} onValueChange={v => setBulkForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["merchant", "partner", "admin", "consumer", "team_member"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Uses Per Code</Label>
              <Input type="number" min={1} max={100} value={bulkForm.usesTotal} onChange={e => setBulkForm(f => ({ ...f, usesTotal: +e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
            <Button onClick={() => bulkMutation.mutate(bulkForm)} disabled={bulkMutation.isPending}>
              {bulkMutation.isPending ? "Creating..." : `Create ${bulkForm.count} Codes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
