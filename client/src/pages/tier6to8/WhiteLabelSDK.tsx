import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Code2, Palette, Key } from "lucide-react";
export default function WhiteLabelSDK() {
  const [primaryColor, setPrimaryColor] = useState("#1a56db");
  const [logoUrl, setLogoUrl] = useState("");
  const { data: config, refetch } = trpc.tier6to8.whiteLabelSDK.getSDKConfig.useQuery();
  const { data: guide } = trpc.tier6to8.whiteLabelSDK.getIntegrationGuide.useQuery({ platform: "web" });
  const { data: analytics } = trpc.tier6to8.whiteLabelSDK.getSDKAnalytics.useQuery({ period: "30d" });
  const updateMutation = trpc.tier6to8.whiteLabelSDK.updateBranding.useMutation({
    onSuccess: () => { toast.success("Branding updated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const rotateMutation = trpc.tier6to8.whiteLabelSDK.rotateSdkKey.useMutation({
    onSuccess: (d: any) => { toast.success(`New SDK key: ${d.sdkKey.slice(0, 20)}...`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Code2 className="w-8 h-8 text-violet-600" />
        <div><h1 className="text-2xl font-bold">White-Label SDK</h1><p className="text-muted-foreground">Embed PayGate payments in your app with custom branding</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="w-4 h-4" />Branding</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
              <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="font-mono" />
            </div>
            <Input placeholder="Logo URL" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
            <Button className="w-full" onClick={() => updateMutation.mutate({ primaryColor, logoUrl, brandName: config?.brandName || "My Company" })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Branding"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Key className="w-4 h-4" />SDK Keys</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {config && <div className="p-2 bg-secondary rounded font-mono text-xs break-all">{config.sdkKey?.slice(0, 32)}...</div>}
            <Button variant="outline" className="w-full" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending}>
              {rotateMutation.isPending ? "Rotating..." : "Rotate SDK Key"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>SDK Analytics (30d)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {analytics && (
              <>
                <div className="flex justify-between text-sm"><span>Total Checkouts</span><span className="font-bold">{analytics.totalCheckouts?.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Completed</span><span className="font-bold">{analytics.completedCheckouts?.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Revenue</span><span className="font-bold text-green-600">₦{((analytics.revenueKobo ?? 0) / 100).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Conversion Rate</span><span className="font-bold">{analytics.conversionRate?.toFixed(1)}%</span></div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {guide && (
        <Card>
          <CardHeader><CardTitle>Integration Guide</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-secondary p-4 rounded-lg overflow-x-auto">{guide.quickstartCode}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
