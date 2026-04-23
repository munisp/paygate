import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Code2, Copy, Eye, EyeOff, Key, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

const SCOPES = [
  { id: "payments", label: "Payments", description: "Initiate and query payment transactions" },
  { id: "webhooks", label: "Webhooks", description: "Register and manage webhook endpoints" },
  { id: "analytics", label: "Analytics", description: "Read-only access to analytics data" },
  { id: "customers", label: "Customers", description: "Create and manage customer records" },
  { id: "payouts", label: "Payouts", description: "Initiate and track payout requests" },
] as const;

type Scope = typeof SCOPES[number]["id"];

export default function WhiteLabelSDK() {
  const [open, setOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>(["payments"]);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const { data: tokens = [], isLoading, refetch } = trpc.whiteLabelSdk.listTokens.useQuery();

  const createToken = trpc.whiteLabelSdk.createToken.useMutation({
    onSuccess: (data) => {
      setRevealedToken(data.rawToken);
      setOpen(false);
      setTokenName("");
      setSelectedScopes(["payments"]);
      setExpiresInDays("");
      refetch();
      toast.success("SDK token created. Copy it now — it won't be shown again.");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeToken = trpc.whiteLabelSdk.revokeToken.useMutation({
    onSuccess: () => { refetch(); toast.success("Token revoked"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleScope = (scope: Scope) => {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copied to clipboard");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">White-Label SDK</h1>
            <p className="text-sm text-gray-500 mt-1">Manage API tokens for your white-label integration</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Token
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create SDK Token</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="token-name">Token Name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g. Production iOS App"
                    value={tokenName}
                    onChange={e => setTokenName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Scopes</Label>
                  <div className="space-y-2 mt-2">
                    {SCOPES.map(scope => (
                      <div key={scope.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                        <Checkbox
                          id={scope.id}
                          checked={selectedScopes.includes(scope.id)}
                          onCheckedChange={() => toggleScope(scope.id)}
                          className="mt-0.5"
                        />
                        <div>
                          <Label htmlFor={scope.id} className="font-medium cursor-pointer">{scope.label}</Label>
                          <p className="text-xs text-gray-500">{scope.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="expires">Expires in (days, optional)</Label>
                  <Input
                    id="expires"
                    type="number"
                    placeholder="Leave blank for no expiry"
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(e.target.value)}
                    min={1}
                    max={365}
                    className="mt-1"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!tokenName.trim() || selectedScopes.length === 0 || createToken.isPending}
                  onClick={() => createToken.mutate({
                    name: tokenName.trim(),
                    scopes: selectedScopes,
                    expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
                  })}
                >
                  {createToken.isPending ? "Creating..." : "Create Token"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Revealed Token Banner */}
        {revealedToken && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800">Copy your token now — it won't be shown again</p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 text-xs bg-amber-100 rounded px-2 py-1 font-mono break-all">
                    {showToken ? revealedToken : revealedToken.replace(/./g, "•")}
                  </code>
                  <Button variant="ghost" size="sm" onClick={() => setShowToken(!showToken)}>
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyToken(revealedToken)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRevealedToken(null)} className="flex-shrink-0">
                ✕
              </Button>
            </div>
          </div>
        )}

        {/* SDK Integration Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code2 className="w-4 h-4" />
              Quick Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto">
{`// Install the PayGate SDK
npm install @paygate/sdk

// Initialize with your SDK token
import { PayGate } from '@paygate/sdk';

const pg = new PayGate({
  token: 'pg_sdk_your_token_here',
  environment: 'production', // or 'sandbox'
});

// Initiate a payment
const payment = await pg.payments.create({
  amount: 500000, // in kobo (₦5,000)
  currency: 'NGN',
  customerEmail: 'customer@example.com',
  reference: 'ORDER_001',
});`}
            </pre>
          </CardContent>
        </Card>

        {/* Token List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Active Tokens ({tokens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading tokens...</div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-8">
                <Key className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No SDK tokens yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tokens.map((token: any) => (
                  <div key={token.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{token.name}</p>
                        {token.is_active ? (
                          <Badge className="text-xs bg-green-100 text-green-700 border-0">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Revoked</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{token.token_prefix}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {(JSON.parse(token.scopes ?? "[]") as string[]).map((scope: string) => (
                          <Badge key={scope} variant="outline" className="text-xs">{scope}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <div className="text-right text-xs text-gray-400">
                        <p>Created {new Date(token.created_at).toLocaleDateString()}</p>
                        {token.expires_at && (
                          <p className={new Date(token.expires_at) < new Date() ? "text-red-500" : ""}>
                            Expires {new Date(token.expires_at).toLocaleDateString()}
                          </p>
                        )}
                        {token.last_used_at && (
                          <p>Last used {new Date(token.last_used_at).toLocaleDateString()}</p>
                        )}
                      </div>
                      {token.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm("Revoke this token? This cannot be undone.")) {
                              revokeToken.mutate({ tokenId: token.id });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
