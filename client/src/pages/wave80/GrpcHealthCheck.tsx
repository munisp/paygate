import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";

export default function GrpcHealthCheck() {
  const { data, isLoading, refetch, isFetching } = trpc5.grpcHealthCheck.checkAllServices.useQuery(undefined, { refetchInterval: 30_000 });

  const services = data?.services ?? [];
  const healthy = services.filter(s => s.status === "healthy").length;
  const degraded = services.filter(s => s.status === "degraded").length;
  const unreachable = services.filter(s => s.status === "unreachable" || s.status === "unhealthy").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">gRPC Health Check</h1><p className="text-muted-foreground">Service mesh health monitoring</p></div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={"w-4 h-4 mr-2 " + (isFetching ? "animate-spin" : "")} />Refresh All</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{healthy}</p><p className="text-sm text-muted-foreground">Healthy</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{degraded}</p><p className="text-sm text-muted-foreground">Degraded</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><XCircle className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">{unreachable}</p><p className="text-sm text-muted-foreground">Unreachable</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Service Status</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        services.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No services found.</p></div> : (
          <div className="space-y-3">{services.map(svc => (
            <div key={svc.name} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                {svc.status === "healthy" ? <CheckCircle className="w-5 h-5 text-green-500" /> : svc.status === "degraded" ? <AlertTriangle className="w-5 h-5 text-yellow-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                <p className="font-medium font-mono">{svc.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {svc.latencyMs != null && <p className="text-sm text-muted-foreground">{svc.latencyMs}ms</p>}
                <Badge variant={svc.status === "healthy" ? "default" : svc.status === "degraded" ? "secondary" : "destructive"}>{svc.status}</Badge>
              </div>
            </div>
          ))}</div>
        )}
        {data?.checkedAt && <p className="text-xs text-muted-foreground mt-4">Last checked: {new Date(data.checkedAt).toLocaleString()}</p>}
      </CardContent></Card>
    </div>
  );
}
