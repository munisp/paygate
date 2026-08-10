import { useState } from "react";
import { Key, Copy, Eye, EyeOff, Plus, Trash2, Shield, Search } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function APIKeys() {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [env, setEnv] = useState<"live" | "test">("live");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.apiKeys.list.useQuery(undefined, { staleTime: 60_000 });
  const createKey = trpc.apiKeys.create.useMutation({
    onSuccess: () => { toast.success("API key created"); setShowCreate(false); setNewName(""); utils.apiKeys.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const revokeKey = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => { toast.success("API key revoked"); utils.apiKeys.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const allKeys = data ?? [];
  const filteredKeys = allKeys.filter(k =>
    !searchQuery || k.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / PAGE_SIZE));
  const keys = filteredKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const copyKey = (k: string) => { navigator.clipboard.writeText(k); toast.success("Copied to clipboard"); };

  return (
    <div className="p-6 space-y-6" role="main" aria-label="API Keys management">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>API Keys</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your API credentials</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search keys..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-sm rounded-md border border-input bg-background w-40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />Create Key</Button>
        </div>
      </div>

      <div className="flex bg-muted rounded-lg p-1 w-fit gap-1">
        {(["live", "test"] as const).map((e: any) => (
          <button key={e} onClick={() => setEnv(e)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${env === e ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {e}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold mb-3">Create API Key</h3>
          <div className="flex gap-3">
            <input value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Key name (e.g. Production Backend)"
              className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            <Button onClick={() => createKey.mutate({ name: newName, environment: env })} disabled={!newName || createKey.isPending}>
              {createKey.isPending ? "Creating..." : "Create"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />) :
        keys.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
            <Key className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No {env} API keys yet</p>
          </div>
        ) : keys.map((k: any) => (
          <div key={k.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Key className="w-4 h-4 text-primary" /></div>
                <div>
                  <p className="font-medium text-sm">{k.name}</p>
                  <p className="text-xs text-muted-foreground">Created {new Date(k.createdAt).toLocaleDateString()} · {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRevealed(r => ({ ...r, [k.id]: !r[k.id] }))} className="p-1.5 rounded hover:bg-muted transition-colors">
                  {revealed[k.id] ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => copyKey(k.keyHash)} className="p-1.5 rounded hover:bg-muted transition-colors">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => revokeKey.mutate({ id: k.id })} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="font-mono text-xs bg-muted rounded-lg px-3 py-2 text-muted-foreground">
              {revealed[k.id] ? k.keyHash : `${k.keyHash.slice(0, 12)}${"•".repeat(32)}`}
            </div>
          </div>
        ))}
      </div>

      <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filteredKeys.length} pageSize={PAGE_SIZE} />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Keep your secret keys secure</p>
          <p className="text-xs text-amber-700 mt-0.5">Never expose secret keys in client-side code or public repositories. Rotate keys immediately if compromised.</p>
        </div>
      </div>
    </div>
  );
}
