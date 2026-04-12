import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from "lucide-react";

const ALL_SCOPES = [
  "payments:read", "payments:write",
  "customers:read", "customers:write",
  "payouts:read", "payouts:write",
  "analytics:read", "webhooks:write",
];

export default function SDKTokens() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.orphaned.sdkTokens.list.useQuery(undefined, { staleTime: 30_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["payments:read", "payments:write"]);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const createMutation = trpc.orphaned.sdkTokens.create.useMutation({
    onSuccess: (data) => {
      setNewToken(data.rawToken);
      setShowCreate(false);
      utils.orphaned.sdkTokens.list.invalidate();
      toast.success("SDK token created");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeMutation = trpc.orphaned.sdkTokens.revoke.useMutation({
    onSuccess: () => {
      utils.orphaned.sdkTokens.list.invalidate();
      toast.success("Token revoked");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleScope = (scope: string) => {
    setScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );

  if (error) return <BridgeEmptyState title="SDK Tokens Unavailable" description={error.message} onRetry={() => utils.orphaned.sdkTokens.list.invalidate()} />;

  const tokens = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Key className="w-6 h-6" /> SDK Tokens</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage programmatic access tokens for your SDK integrations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> Create Token</Button>
      </div>

      {newToken && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardHeader><CardTitle className="text-green-700 dark:text-green-300 text-sm">Token Created — Copy Now (shown once)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white dark:bg-black p-2 rounded border font-mono break-all">
                {showToken ? newToken : "•".repeat(40)}
              </code>
              <Button size="icon" variant="ghost" onClick={() => setShowToken(v => !v)}>{showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied!"); }}><Copy className="w-4 h-4" /></Button>
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setNewToken(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      {tokens.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No SDK tokens yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <Card key={token.tokenId}>
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-mono">{token.tokenId}</code>
                    <Badge variant={token.isRevoked ? "destructive" : "secondary"}>{token.isRevoked ? "Revoked" : "Active"}</Badge>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(token.scopes as string[]).map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires: {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "Never"} · Created: {new Date(token.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!token.isRevoked && (
                  <Button size="sm" variant="destructive" onClick={() => revokeMutation.mutate({ tokenId: token.tokenId })}>
                    <Trash2 className="w-4 h-4 mr-1" /> Revoke
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create SDK Token</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Expires In (days)</Label>
              <Input type="number" min={1} max={365} value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} />
            </div>
            <div>
              <Label className="mb-2 block">Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map(scope => (
                  <div key={scope} className="flex items-center gap-2">
                    <Checkbox id={scope} checked={scopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} />
                    <label htmlFor={scope} className="text-sm cursor-pointer">{scope}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={scopes.length === 0 || createMutation.isPending} onClick={() => createMutation.mutate({ scopes, expiresInDays })}>
              {createMutation.isPending ? "Creating..." : "Create Token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
