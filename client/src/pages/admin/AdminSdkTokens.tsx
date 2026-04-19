import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Key, Search, Plus, Trash2, Copy, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function AdminSdkTokens() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScope, setNewTokenScope] = useState("read");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.wave25.sdkTokens.list.useQuery({ page, limit: 30 });
  const { data: stats } = trpc.wave25.sdkTokens.getStats.useQuery();

  const createToken = trpc.wave25.sdkTokens.create.useMutation({
    onSuccess: (res) => {
      setCreatedToken(res.token);
      setNewTokenName("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeToken = trpc.wave25.sdkTokens.revoke.useMutation({
    onSuccess: () => { toast.success("Token revoked"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => toast.success("Copied to clipboard"));
  };

  const filtered = data?.rows.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.merchantId?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Key className="h-6 w-6 text-primary" />
              SDK Token Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage API tokens for SDK integrations across all merchants
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Token
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Tokens", value: stats?.total ?? 0 },
            { label: "Active", value: stats?.active ?? 0, color: "text-green-500" },
            { label: "Revoked", value: stats?.revoked ?? 0, color: "text-red-500" },
            { label: "Used Today", value: stats?.usedToday ?? 0, color: "text-blue-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or merchant ID..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Token Preview</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No SDK tokens found</TableCell></TableRow>
                ) : filtered.map(token => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell className="font-mono text-xs">{token.merchantId?.slice(0, 12) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{token.scope ?? "read"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {token.tokenPreview ?? "sk_***..."}
                    </TableCell>
                    <TableCell>
                      {token.isActive ? (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" /> Revoked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {token.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => revokeToken.mutate({ id: token.id! })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {data && data.total > 30 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {((page - 1) * 30) + 1}–{Math.min(page * 30, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 30 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Token Dialog */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) { setCreatedToken(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdToken ? "Token Created" : "Create SDK Token"}</DialogTitle>
          </DialogHeader>
          {createdToken ? (
            <div className="py-4 space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                  Token created successfully. Copy it now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-white dark:bg-black border rounded p-2 break-all">
                    {createdToken}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyToken(createdToken)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Token Name <span className="text-red-500">*</span></label>
                <Input
                  placeholder="e.g. Mobile App Production"
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Scope</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                  value={newTokenScope}
                  onChange={e => setNewTokenScope(e.target.value)}
                >
                  <option value="read">Read Only</option>
                  <option value="write">Read + Write</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreatedToken(null); }}>
              {createdToken ? "Close" : "Cancel"}
            </Button>
            {!createdToken && (
              <Button
                onClick={() => createToken.mutate({ name: newTokenName, scope: newTokenScope })}
                disabled={createToken.isPending || !newTokenName}
              >
                {createToken.isPending ? "Creating..." : "Create Token"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
