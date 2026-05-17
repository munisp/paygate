import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, Shield, Database, Key, Code } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function OpenBankingPortal() {
  const { user } = useAuth();
  const [customerId, setCustomerId] = useState("");
  const [dataTypes, setDataTypes] = useState<("account_balance" | "transaction_history" | "credit_score")[]>(["account_balance"]);
  const [consentToken, setConsentToken] = useState("");
  const [fetchDataType, setFetchDataType] = useState<"account_balance" | "transaction_history" | "credit_score">("account_balance");
  const [sdkEnv, setSdkEnv] = useState<"sandbox" | "production">("production");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [sdkToken, setSdkToken] = useState<string | null>(null);

  const consentMutation = trpc.tier1to5.openBanking.issueConsentToken.useMutation({
    onSuccess: (data: any) => {
      setGeneratedToken(data.consentToken ?? data.token ?? JSON.stringify(data));
      toast("Consent token issued successfully");
    },
    onError: (e: any) => toast("Failed to issue consent token", { description: e.message }),
  });

  const sdkTokenMutation = trpc.tier1to5.openBanking.issueSDKToken.useMutation({
    onSuccess: (data: any) => {
      setSdkToken(data.token ?? data.sdkToken ?? JSON.stringify(data));
      toast("SDK token issued");
    },
    onError: (e: any) => toast("Failed to issue SDK token", { description: e.message }),
  });

  const { data: customerData, isLoading: customerDataLoading } = trpc.tier1to5.openBanking.getCustomerData.useQuery(
    { customerId, dataType: fetchDataType, consentToken },
    { enabled: !!customerId && !!consentToken }, staleTime: 30_000})

  const toggleDataType = (dt: "account_balance" | "transaction_history" | "credit_score") => {
    setDataTypes(prev => prev.includes(dt) ? prev.filter(x => x !== dt) : [...prev, dt]);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Open Banking Portal</h1>
        <p className="text-muted-foreground">Issue consent tokens, fetch customer financial data, and generate SDK access tokens</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Shield, color: "text-blue-500", label: "Consent Tokens", description: "Issue time-limited consent tokens for customer data access" },
          { icon: Database, color: "text-green-500", label: "Customer Data", description: "Fetch account balances, transactions, and credit scores" },
          { icon: Key, color: "text-purple-500", label: "SDK Tokens", description: "Generate tokens for embedded finance SDK integrations" },
        ].map(({ icon: Icon, color, label, description }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Icon className={`h-8 w-8 ${color} flex-shrink-0`} />
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Issue Consent Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Issue Consent Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Customer ID</label>
            <Input placeholder="e.g. cust_123456" value={customerId} onChange={(e: any) => setCustomerId(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Data Types</label>
            <div className="flex gap-2 mt-2">
              {(["account_balance", "transaction_history", "credit_score"] as const).map(dt => (
                <button
                  key={dt}
                  onClick={() => toggleDataType(dt)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${dataTypes.includes(dt) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {dt.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={() => consentMutation.mutate({ customerId, dataTypes, expiresInSeconds: 3600 })}
            disabled={!customerId || dataTypes.length === 0 || consentMutation.isPending}
          >
            {consentMutation.isPending ? "Issuing..." : "Issue Consent Token"}
          </Button>
          {generatedToken && (
            <div className="mt-3 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Consent Token</p>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(generatedToken)}>Copy</Button>
              </div>
              <code className="text-xs break-all">{generatedToken}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fetch Customer Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Fetch Customer Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Consent Token</label>
              <Input placeholder="Paste consent token here" value={consentToken} onChange={(e: any) => setConsentToken(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Data Type</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={fetchDataType}
                onChange={(e: any) => setFetchDataType(e.target.value as any)}
              >
                <option value="account_balance">Account Balance</option>
                <option value="transaction_history">Transaction History</option>
                <option value="credit_score">Credit Score</option>
              </select>
            </div>
          </div>
          {customerDataLoading && <div className="flex items-center justify-center h-16"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>}
          {customerData && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Response:</p>
              <pre className="text-xs overflow-x-auto">{JSON.stringify(customerData, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SDK Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" /> Issue SDK Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Environment</label>
            <div className="flex gap-2 mt-2">
              {(["sandbox", "production"] as const).map(env => (
                <Button key={env} size="sm" variant={sdkEnv === env ? "default" : "outline"} onClick={() => setSdkEnv(env)}>
                  {env}
                </Button>
              ))}
            </div>
          </div>
          <Button
            onClick={() => sdkTokenMutation.mutate({ scopes: ["payments", "data"], expiresIn: 3600, environment: sdkEnv })}
            disabled={sdkTokenMutation.isPending}
          >
            {sdkTokenMutation.isPending ? "Generating..." : "Generate SDK Token"}
          </Button>
          {sdkToken && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">SDK Token</p>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(sdkToken)}>Copy</Button>
              </div>
              <code className="text-xs break-all">{sdkToken}</code>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
