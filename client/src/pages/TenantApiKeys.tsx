import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Key, Copy, Trash2, AlertTriangle } from "lucide-react";

const PERMISSION_BITS: Record<string, number> = {
  READ_TRANSACTIONS: 1,
  WRITE_TRANSACTIONS: 2,
  READ_CUSTOMERS: 4,
  WRITE_CUSTOMERS: 8,
  READ_PAYOUTS: 16,
  WRITE_PAYOUTS: 32,
  READ_ANALYTICS: 64,
  ADMIN: 128,
};

function permissionsToNumber(selected: string[]): number {
  return selected.reduce((acc, p) => acc | (PERMISSION_BITS[p] ?? 0), 0);
}

export default function TenantApiKeys() {
  const tenantId = "3";
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    selectedPerms: ["READ_TRANSACTIONS", "READ_ANALYTICS"] as string[],
    expiresInDays: undefined as number | undefined,
  });

  const { data: keys, refetch, isLoading } = trpc.wave29.tenantApiKey.list.useQuery({ tenantId }, { staleTime: 30_000 });

  const createKey = trpc.wave29.tenantApiKey.create.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeKey = trpc.wave29.tenantApiKey.revoke.useMutation({
    onSuccess: () => { toast.success("API key revoked"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const togglePerm = (perm: string) => {
    setForm(f => ({
      ...f,
      selectedPerms: f.selectedPerms.includes(perm)
        ? f.selectedPerms.filter(p => p !== perm)
        : [...f.selectedPerms, perm],
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 mt-1">Manage scoped API keys for your tenant integrations</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
            </DialogHeader>
            {newKey ? (
              <div className="space-y-4">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-700 mb-2">
                    API Key Created — Copy it now, it won't be shown again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border rounded px-2 py-1 break-all">
                      {newKey}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(newKey);
                        toast.success("Copied!");
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => { setNewKey(null); setShowCreate(false); setForm({ name: "", selectedPerms: ["READ_TRANSACTIONS", "READ_ANALYTICS"], expiresInDays: undefined }); }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Key Name</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Production Integration"
                  />
                </div>

                <div>
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {Object.keys(PERMISSION_BITS).map(perm => (
                      <div key={perm} className="flex items-center gap-2">
                        <Checkbox
                          id={perm}
                          checked={form.selectedPerms.includes(perm)}
                          onCheckedChange={() => togglePerm(perm)}
                        />
                        <label htmlFor={perm} className="text-xs cursor-pointer">
                          {perm.replace(/_/g, " ")}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Expires In (days, optional)</Label>
                  <Input
                    type="number"
                    value={form.expiresInDays ?? ""}
                    onChange={e => setForm(f => ({ ...f, expiresInDays: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="Leave blank for no expiry"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!form.name || createKey.isPending}
                  onClick={() => createKey.mutate({
                    tenantId,
                    name: form.name,
                    permissions: permissionsToNumber(form.selectedPerms),
                    expiresInDays: form.expiresInDays,
                  })}
                >
                  <Key className="w-4 h-4 mr-2" />
                  Generate API Key
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keys ?? []).map((k: any) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{k.key_prefix}_***</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(k.permissionNames ?? []).slice(0, 3).map((p: string) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p.replace(/_/g, " ")}
                        </Badge>
                      ))}
                      {(k.permissionNames ?? []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{k.permissionNames.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={k.is_active ? "default" : "destructive"}>
                      {k.is_active ? "Active" : "Revoked"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {k.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        aria-label="Delete" onClick={() => {
                          if (confirm("Revoke this API key? This cannot be undone.")) {
                            revokeKey.mutate({ keyId: k.id });
                          }
                        }}
                      ><Trash2/>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(keys ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No API keys yet. Create your first key above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Security Best Practices</p>
              <ul className="mt-1 space-y-1 list-disc list-inside text-amber-700">
                <li>Never expose API keys in client-side code or version control</li>
                <li>Use the minimum permissions required for each integration</li>
                <li>Set expiry dates for temporary integrations</li>
                <li>Rotate keys regularly and immediately if compromised</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
