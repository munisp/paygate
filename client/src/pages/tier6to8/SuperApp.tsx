import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Smartphone, Users, Zap } from "lucide-react";
export default function SuperApp() {
  const { isLoading, data: config, refetch } = trpc.tier6to8.superApp.getAppConfig.useQuery();
  const { data: stats } = trpc.tier6to8.superApp.getConsumerStats.useQuery({ period: "30d" });
  const pushMutation = trpc.tier6to8.superApp.pushAppUpdate.useMutation({
    onSuccess: (d: any) => { toast.success(`Update pushed to ${d.devicesReached} devices`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.tier6to8.superApp.updateModules.useMutation({
    onSuccess: () => { toast.success("Modules updated"); refetch(); },
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
        <Smartphone className="w-8 h-8 text-pink-600" />
        <div><h1 className="text-2xl font-bold">Consumer Super App Shell</h1><p className="text-muted-foreground">Manage the PayGate consumer mobile super app modules and updates</p></div>
      </div>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">MAU</p><p className="text-2xl font-bold">{stats.mau?.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">DAU</p><p className="text-2xl font-bold">{stats.dau?.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Avg Session (min)</p><p className="text-2xl font-bold">{stats.avgSessionMinutes?.toFixed(1)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Retention Rate</p><p className="text-2xl font-bold">{stats.retentionRate?.toFixed(1)}%</p></CardContent></Card>
        </div>
      )}
      {config && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>App Modules</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {config.modules?.map((m: any) => (
                <div key={m.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <Badge variant={m.enabled ? "default" : "secondary"}>{m.enabled ? "Enabled" : "Disabled"}</Badge>
                </div>
              ))}
              <Button className="w-full mt-2" variant="outline" onClick={() => updateMutation.mutate({ modules: config.modules?.map((m: any) => ({ id: m.id, enabled: m.enabled })) || [] })}>
                Save Module Config
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-4 h-4" />Push Update</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">App: <span className="font-mono font-bold">{config.appName}</span></p>
              <p className="text-sm text-muted-foreground">Modules: <span className="font-mono">{config.modules?.length} active</span></p>
              <Button className="w-full" onClick={() => pushMutation.mutate({ version: "1.0.1", releaseNotes: "New features and bug fixes", targetPlatforms: ["ios", "android", "web"], forceUpdate: false })} disabled={pushMutation.isPending}>
                {pushMutation.isPending ? "Pushing..." : "Push OTA Update"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
