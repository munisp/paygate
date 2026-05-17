import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Globe, Key, Shield, Copy, Zap } from "lucide-react";

const DATA_TYPES = ["account_balance", "transaction_history", "credit_score"] as const;
type DataType = typeof DATA_TYPES[number];

export default function OpenBanking() {
  const [customerId, setCustomerId] = useState("");
  const [selectedDataTypes, setSelectedDataTypes] = useState<DataType[]>(["account_balance"]);
  const [consentToken, setConsentToken] = useState("");
  const [viewDataType, setViewDataType] = useState<DataType>("account_balance");
  const [sdkScopes, setSdkScopes] = useState(["payments", "data"]);
  const [sdkEnv, setSdkEnv] = useState<"sandbox" | "production">("sandbox");

  const consentMutation = trpc.tier1to5.openBanking.issueConsentToken.useMutation({
    onSuccess: (data: any) => {
      toast.success("Consent token issued.");
      setConsentToken(data.consentToken ?? "");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: customerData, isLoading: dataLoading } = trpc.tier1to5.openBanking.getCustomerData.useQuery(
    { customerId, dataType: viewDataType, consentToken },
    { enabled: !!customerId && !!consentToken }, staleTime: 30_000})

  const sdkTokenMutation = trpc.tier1to5.openBanking.issueSDKToken.useMutation({
    onSuccess: (data: any) => {
      toast.success("SDK token issued.");
      navigator.clipboard.writeText(data.token ?? "");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleDataType = (dt: DataType) => {
    setSelectedDataTypes(s => s.includes(dt) ? s.filter(x => x !== dt) : [...s, dt]);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Open Banking API</h1>
          <p className="text-muted-foreground text-sm mt-1">APISIX-gated data APIs with Keycloak OAuth2 scopes and Permify policies</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Issue Consent Token */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Issue Consent Token</CardTitle>
              <CardDescription>Grant a customer consent token for data access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Customer ID</Label>
                <Input placeholder="cust_abc123" value={customerId} onChange={e => setCustomerId(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="mb-2 block">Data Types</Label>
                <div className="flex flex-wrap gap-2">
                  {DATA_TYPES.map(dt => (
                    <button key={dt} onClick={() => toggleDataType(dt)}
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${selectedDataTypes.includes(dt) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                      {dt.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => consentMutation.mutate({ customerId, dataTypes: selectedDataTypes, expiresInSeconds: 3600 })} disabled={consentMutation.isPending || !customerId || !selectedDataTypes.length} className="w-full">
                {consentMutation.isPending ? "Issuing..." : "Issue Consent Token"}
              </Button>
              {consentToken && (
                <div className="p-2 bg-muted rounded flex items-center justify-between gap-2">
                  <span className="font-mono text-xs truncate">{consentToken}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(consentToken); toast.success("Copied!"); }}><Copy/>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fetch Customer Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" />Fetch Customer Data</CardTitle>
              <CardDescription>Retrieve consented customer data via Open Banking API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Consent Token</Label>
                <Input placeholder="Paste consent token..." value={consentToken} onChange={e => setConsentToken(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="mb-2 block">Data Type</Label>
                <div className="flex gap-2">
                  {DATA_TYPES.map(dt => (
                    <button key={dt} onClick={() => setViewDataType(dt)}
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${viewDataType === dt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                      {dt.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              {dataLoading ? (
                <div className="animate-pulse h-20 bg-muted rounded" />
              ) : customerData ? (
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">{JSON.stringify(customerData, null, 2)}</pre>
              ) : (
                <p className="text-xs text-muted-foreground">Enter a consent token and customer ID to fetch data.</p>
              )}
            </CardContent>
          </Card>

          {/* SDK Token */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Embedded Finance SDK Token</CardTitle>
              <CardDescription>Issue short-lived tokens for the PayGate JS/React Native SDK</CardDescription>
            </CardHeader>
            <CardContent className="flex items-end gap-4">
              <div className="flex-1">
                <Label>Environment</Label>
                <div className="flex gap-2 mt-1">
                  {(["sandbox", "production"] as const).map(env => (
                    <button key={env} onClick={() => setSdkEnv(env)}
                      className={`px-4 py-1.5 rounded text-sm border transition-all ${sdkEnv === env ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                      {env}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => sdkTokenMutation.mutate({ scopes: sdkScopes, expiresIn: 3600, environment: sdkEnv })} disabled={sdkTokenMutation.isPending}>
                <Zap className="w-4 h-4 mr-2" />{sdkTokenMutation.isPending ? "Issuing..." : "Issue SDK Token"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
