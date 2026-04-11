import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link2, Database } from "lucide-react";
const PROVIDERS = [{ id: "mono", name: "Mono", logo: "🏦" }, { id: "okra", name: "Okra", logo: "🔗" }, { id: "stitch", name: "Stitch", logo: "🧵" }, { id: "plaid", name: "Plaid", logo: "🔐" }];
export default function OpenFinanceHub() {
  const { isLoading, data: providers, refetch } = trpc.tier6to8.openFinance.getConnectedProviders.useQuery();
  const { data: insights } = trpc.tier6to8.openFinance.getDataInsights.useQuery({ providerId: "mono" });
  const connectMutation = trpc.tier6to8.openFinance.connectProvider.useMutation({
    onSuccess: (d: any) => { window.open(d.authUrl, "_blank"); toast.success("Opening provider auth..."); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const revokeMutation = trpc.tier6to8.openFinance.revokeProvider.useMutation({
    onSuccess: () => { toast.success("Provider disconnected"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="w-8 h-8 text-blue-600" />
        <div><h1 className="text-2xl font-bold">Open Finance Hub</h1><p className="text-muted-foreground">Connect bank accounts and aggregate financial data via open banking APIs</p></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {PROVIDERS.map(p => {
          const connected = providers?.providers.find((c: any) => c.providerId === p.id);
          return (
            <Card key={p.id}>
              <CardContent className="pt-4 text-center space-y-2">
                <div className="text-3xl">{p.logo}</div>
                <p className="font-medium">{p.name}</p>
                <Badge variant={connected ? "default" : "secondary"}>{connected ? "Connected" : "Not connected"}</Badge>
                {connected ? (
                  <Button size="sm" variant="destructive" className="w-full" onClick={() => revokeMutation.mutate({ providerId: p.id })}>Disconnect</Button>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => connectMutation.mutate({ providerId: p.id, scopes: ["accounts", "transactions", "identity"], redirectUrl: window.location.origin + "/open-finance/callback" })}>Connect</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {insights && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-4 h-4" />Data Insights</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">Connected Accounts</p><p className="text-2xl font-bold">{insights.connectedAccounts}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Balance</p><p className="text-2xl font-bold">₦{(insights.totalBalanceKobo / 100).toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly Inflow</p><p className="text-2xl font-bold text-green-600">₦{(insights.monthlyInflowKobo / 100).toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly Outflow</p><p className="text-2xl font-bold text-red-600">₦{(insights.monthlyOutflowKobo / 100).toLocaleString()}</p></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
