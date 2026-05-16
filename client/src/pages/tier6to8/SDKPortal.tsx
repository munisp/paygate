import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Key, Code, RefreshCw, Copy, RotateCcw, BarChart2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function SDKPortal() {
  const { user } = useAuth();
  const [platform, setPlatform] = useState<"web" | "ios" | "android" | "react_native" | "flutter">("web");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const configQuery = trpc.tier6to8.whiteLabelSDK.getSDKConfig.useQuery(undefined, { enabled: !!user }, { staleTime: 30_000 });
  const guideQuery = trpc.tier6to8.whiteLabelSDK.getIntegrationGuide.useQuery({ platform }, { enabled: !!user }, { staleTime: 30_000 });
  const analyticsQuery = trpc.tier6to8.whiteLabelSDK.getSDKAnalytics.useQuery({ period }, { enabled: !!user }, { staleTime: 30_000 });

  const rotateMutation = trpc.tier6to8.whiteLabelSDK.rotateSdkKey.useMutation({
    onSuccess: (data) => {
      toast("SDK key rotated", { description: `Old key expires at ${new Date(data.oldKeyExpiresAt).toLocaleString()}` });
      configQuery.refetch();
    },
    onError: (e: any) => toast("Failed to rotate key", { description: e.message }),
  });

  const config = configQuery.data;
  const guide = guideQuery.data;
  const analytics = analyticsQuery.data;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SDK Portal</h1>
          <p className="text-muted-foreground">Manage your PayGate JS SDK configuration and integrations</p>
        </div>
        <Button onClick={() => configQuery.refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* SDK Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> SDK Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted rounded px-3 py-2 text-sm font-mono">{config?.sdkKey ?? "Not configured"}</code>
                <Button size="sm" variant="outline" aria-label="Copy" onClick={() => copyToClipboard(config?.sdkKey ?? "")}><Copy/>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Rotate
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Brand:</span> <span className="font-medium">{config?.brandName}</span></div>
                <div><span className="text-muted-foreground">Color:</span> <span className="font-medium">{config?.primaryColor}</span></div>
                <div><span className="text-muted-foreground">Domain:</span> <span className="font-medium">{config?.customDomain ?? "Default"}</span></div>
                <div><span className="text-muted-foreground">Methods:</span> <span className="font-medium">{config?.supportedPaymentMethods?.length ?? 0}</span></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" /> SDK Analytics
            </CardTitle>
            <select
              className="border rounded px-2 py-1 text-sm bg-background"
              value={period}
              onChange={(e: any) => setPeriod(e.target.value as any)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Checkouts", value: analytics?.totalCheckouts ?? 0 },
              { label: "Completed", value: analytics?.completedCheckouts ?? 0 },
              { label: "Conversion Rate", value: `${((analytics?.conversionRate ?? 0) * 100).toFixed(1)}%` },
              { label: "Revenue", value: `₦${((analytics?.revenueKobo ?? 0) / 100).toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Integration Guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" /> Integration Guide
            </CardTitle>
            <div className="flex gap-1">
              {(["web", "ios", "android", "react_native", "flutter"] as const).map(p => (
                <Button key={p} size="sm" variant={platform === p ? "default" : "outline"} onClick={() => setPlatform(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {guide ? (
            <>
              <div>
                <p className="text-sm font-medium mb-2">Install</p>
                <div className="bg-muted rounded-md p-3 font-mono text-sm flex items-center justify-between">
                  <code>{guide.installCommand}</code>
                  <Button size="sm" variant="ghost" aria-label="Copy" onClick={() => copyToClipboard(guide.installCommand)}><Copy/>
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Quick Start (SDK v{guide.sdkVersion})</p>
                <div className="bg-muted rounded-md p-3 font-mono text-xs overflow-x-auto">
                  <pre>{guide.quickstartCode}</pre>
                </div>
              </div>
              <a href={guide.documentationUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                Full Documentation →
              </a>
            </>
          ) : (
            <p className="text-muted-foreground">Loading guide...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
