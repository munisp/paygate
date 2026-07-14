// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminConfig() {
  const utils = trpc.useUtils();
  const flagsQuery = trpc.admin.config.getFeatureFlags.useQuery();
  const rateLimitsQuery = trpc.admin.config.getRateLimits.useQuery();
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);

  const updateFlagMutation = trpc.admin.config.updateFeatureFlag.useMutation({
    onSuccess: () => { utils.admin.config.getFeatureFlags.invalidate(); toast.success("Feature flag updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const maintenanceMutation = trpc.admin.config.setMaintenanceMode.useMutation({
    onSuccess: (_data, vars) => { setMaintenanceEnabled(vars.enabled); toast.success("Maintenance mode updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const flags = ((flagsQuery.data as unknown as any)?.flags ?? (flagsQuery.data as unknown as any[]) ?? []) as any[];
  const rateLimits = ((rateLimitsQuery.data as unknown as any)?.limits ?? (rateLimitsQuery.data as unknown as any[]) ?? []) as any[];
  const maintenance = { enabled: maintenanceEnabled };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuration Panel</h1>
          <p className="text-slate-400 text-sm mt-1">Feature flags, rate limits, and maintenance settings</p>
        </div>
        <Tabs defaultValue="flags">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="flags" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Feature Flags</TabsTrigger>
            <TabsTrigger value="ratelimits" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Rate Limits</TabsTrigger>
            <TabsTrigger value="maintenance" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Maintenance</TabsTrigger>
          </TabsList>
          <TabsContent value="flags" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Feature Flags</CardTitle></CardHeader>
              <CardContent className="p-0">
                {flagsQuery.isLoading ? (
                  <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-slate-800" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Flag Key</TableHead>
                        <TableHead className="text-slate-400">Description</TableHead>
                        <TableHead className="text-slate-400">Environment</TableHead>
                        <TableHead className="text-slate-400 text-right">Enabled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flags.map((f: any) => (
                        <TableRow key={f.key} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-white font-mono text-sm">{f.key}</TableCell>
                          <TableCell className="text-slate-400 text-sm">{f.description ?? "—"}</TableCell>
                          <TableCell><Badge className="text-xs bg-slate-700 text-slate-300">{f.environment ?? "all"}</Badge></TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={f.enabled}
                              disabled={updateFlagMutation.isPending}
                              onCheckedChange={(checked) => updateFlagMutation.mutate({ key: f.key, value: checked })}
                              className="data-[state=checked]:bg-red-600"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      {flags.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No feature flags configured</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="ratelimits" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base">Rate Limits</CardTitle></CardHeader>
              <CardContent className="p-0">
                {rateLimitsQuery.isLoading ? (
                  <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Endpoint</TableHead>
                        <TableHead className="text-slate-400 text-right">Requests/Min</TableHead>
                        <TableHead className="text-slate-400 text-right">Burst Limit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateLimits.map((r: any) => (
                        <TableRow key={r.endpoint} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-white font-mono text-sm">{r.endpoint}</TableCell>
                          <TableCell className="text-right text-slate-300">{r.requestsPerMinute}</TableCell>
                          <TableCell className="text-right text-slate-300">{r.burstLimit}</TableCell>
                        </TableRow>
                      ))}
                      {rateLimits.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-8">No rate limits configured</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Maintenance Mode</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {maintenanceMutation.isPending ? <Skeleton className="h-16 w-full bg-slate-800" /> : (
                  <>
                    <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                      <div>
                        <p className="text-white font-medium">Maintenance Mode</p>
                        <p className="text-slate-400 text-sm mt-1">When enabled, all API requests will return a 503 maintenance response</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={maintenance?.enabled ? "bg-red-500/20 text-red-400 border-red-500/30 border" : "bg-green-500/20 text-green-400 border-green-500/30 border"}>
                          {maintenance?.enabled ? "ENABLED" : "DISABLED"}
                        </Badge>
                        <Switch
                          checked={maintenance?.enabled ?? false}
                          disabled={maintenanceMutation.isPending}
                          onCheckedChange={(checked) => maintenanceMutation.mutate({ enabled: checked, message: checked ? "Platform maintenance in progress. Please try again later." : undefined })}
                          className="data-[state=checked]:bg-red-600"
                        />
                      </div>
                    </div>
                    {maintenance?.enabled && (
                      <div className="p-3 bg-red-950/30 border border-red-900 rounded-lg">
                        <p className="text-red-400 text-sm font-medium">⚠ Maintenance mode is currently active</p>
                        <p className="text-slate-400 text-xs mt-1">Maintenance mode is active</p>
                        
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
