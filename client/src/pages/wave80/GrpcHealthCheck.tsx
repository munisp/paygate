import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
export default function GrpcHealthCheck() {
  const [refreshing, setRefreshing] = useState(false);
  const services = [
    { name: "go-bridge", url: "http://go-bridge:8080", status: "healthy", latency: 12 },
    { name: "fraud-scoring", url: "http://fraud-scoring:8083", status: "healthy", latency: 45 },
    { name: "digital-gold-service", url: "http://digital-gold-service:9020", status: "unreachable", latency: null },
    { name: "mutual-funds-service", url: "http://mutual-funds-service:9021", status: "healthy", latency: 28 },
    { name: "wealth-advisor-service", url: "http://wealth-advisor-service:9022", status: "degraded", latency: 890 },
    { name: "remittance-service", url: "http://remittance-service:9024", status: "healthy", latency: 67 },
    { name: "ollama", url: "http://ollama:11434", status: "healthy", latency: 120 },
    { name: "temporal", url: "http://temporal:7233", status: "healthy", latency: 8 },
  ];
  const healthy = services.filter(s=>s.status==="healthy").length;
  const degraded = services.filter(s=>s.status==="degraded").length;
  const unreachable = services.filter(s=>s.status==="unreachable").length;
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">gRPC Health Check</h1><p className="text-muted-foreground">Service mesh health monitoring</p></div>
        <Button variant="outline" onClick={()=>setRefreshing(true)} disabled={refreshing}><RefreshCw className={"w-4 h-4 mr-2 "+(refreshing?"animate-spin":"")} />Refresh All</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{healthy}</p><p className="text-sm text-muted-foreground">Healthy</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{degraded}</p><p className="text-sm text-muted-foreground">Degraded</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><XCircle className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">{unreachable}</p><p className="text-sm text-muted-foreground">Unreachable</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Service Status</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{services.map(svc=>(
          <div key={svc.name} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              {svc.status==="healthy"?<CheckCircle className="w-5 h-5 text-green-500"/>:svc.status==="degraded"?<AlertTriangle className="w-5 h-5 text-yellow-500"/>:<XCircle className="w-5 h-5 text-red-500"/>}
              <div><p className="font-medium font-mono">{svc.name}</p><p className="text-sm text-muted-foreground">{svc.url}</p></div>
            </div>
            <div className="flex items-center gap-3">
              {svc.latency!==null && <p className="text-sm text-muted-foreground">{svc.latency}ms</p>}
              <Badge variant={svc.status==="healthy"?"default":svc.status==="degraded"?"secondary":"destructive"}>{svc.status}</Badge>
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
