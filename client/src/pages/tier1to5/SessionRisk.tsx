import { useState } from "react";
import { trpc2 } from "@/lib/trpc2";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Fingerprint, Shield, Clock, AlertTriangle } from "lucide-react";

export default function SessionRisk() {
  const { data: history, isLoading, refetch } = trpc2.sessionRisk.getRiskHistory.useQuery({ limit: 50 });

  const riskColor = (score: number) => {
    if (score < 30) return "text-green-600 bg-green-50";
    if (score < 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const riskLabel = (score: number) => {
    if (score < 30) return "Low";
    if (score < 60) return "Medium";
    return "High";
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Device Fingerprinting & Session Risk</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time session risk scoring with Redis-backed velocity checks</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-primary opacity-70" />
              <div>
                <p className="text-2xl font-bold">{history?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Sessions Analyzed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-orange-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{history?.filter((h: any) => h.riskScore >= 60).length ?? 0}</p>
                <p className="text-xs text-muted-foreground">High Risk Sessions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Shield className="w-8 h-8 text-green-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{history?.filter((h: any) => h.blocked).length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Blocked</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session History */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Session Risk Events</h2>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse h-16" />)}</div>
          ) : !history?.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><Fingerprint className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No session risk events yet.</p></CardContent></Card>
          ) : (
            <div className="space-y-2">
              {history.map((event: any) => (
                <Card key={event.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskColor(event.riskScore)}`}>
                          {riskLabel(event.riskScore)} ({event.riskScore})
                        </span>
                        <span className="font-mono text-xs">{event.fingerprintId?.slice(0, 12)}...</span>
                        {event.blocked && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{event.ipAddress}</span>
                        <span>{event.userAgent?.slice(0, 40)}...</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(event.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Signals</p>
                      <p className="text-sm font-medium">{event.signals?.join(", ") ?? "—"}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
