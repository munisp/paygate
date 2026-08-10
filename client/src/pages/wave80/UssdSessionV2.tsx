import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, BarChart3, GitBranch, TrendingDown, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function UssdSessionV2() {
  const [tab, setTab] = useState("analytics");

  const { isLoading, data: analyticsData, isError } = trpc.wave80.ussdSessionV2.getSessionAnalytics.useQuery({ period: "7d" }, { staleTime: 30_000 });
  const { data: menuData } = trpc.wave80.ussdSessionV2.getMenuFlow.useQuery();
  const { data: dropOffData } = trpc.wave80.ussdSessionV2.getDropOffAnalysis.useQuery({ period: "7d" }, { staleTime: 30_000 });

  const analytics = analyticsData ?? { totalSessions: 0, completedSessions: 0, abandonedSessions: 0, avgSessionDuration: 0 };
  const menuFlow = menuData?.menus ?? [];

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">USSD Session V2</h1><p className="text-muted-foreground">Stateful USSD menus, session analytics, and drop-off analysis</p></div>
        <Button variant="outline"><Settings className="w-4 h-4 mr-2" />Configure Menu</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Phone className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{analytics.totalSessions.toLocaleString()}</p><p className="text-sm text-muted-foreground">Sessions (7d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><BarChart3 className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics.completedSessions.toLocaleString()}</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingDown className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">{analytics.abandonedSessions.toLocaleString()}</p><p className="text-sm text-muted-foreground">Abandoned</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><GitBranch className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{analytics.avgSessionDuration}s</p><p className="text-sm text-muted-foreground">Avg Duration</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="analytics">Drop-off Analysis</TabsTrigger><TabsTrigger value="menu">Menu Flow</TabsTrigger></TabsList>
        <TabsContent value="analytics">
          <Card><CardHeader><CardTitle>Drop-off Points</CardTitle></CardHeader><CardContent>
            {(dropOffData?.dropOffPoints ?? []).length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No drop-off data yet.</p></div> : (
              <div className="space-y-3">{(dropOffData?.dropOffPoints ?? []).map((p: any, i: any) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div><p className="font-medium">{p.menu}</p><p className="text-sm text-muted-foreground">{p.count} drop-offs</p></div>
                  <p className="font-bold text-red-600">{p.dropOffRate}%</p>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="menu">
          <Card><CardHeader><CardTitle>USSD Menu Structure</CardTitle></CardHeader><CardContent>
            {menuFlow.length === 0 ? (
              <div className="space-y-4">
                {[{ title: "Main Menu", options: ["1. Check Balance","2. Transfer Money","3. Buy Airtime","4. Pay Bills","0. Exit"] },
                  { title: "Transfer Money", options: ["1. Bank Transfer","2. Mobile Money","3. PayGate Wallet","0. Back"] }].map((m: any, i: any) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <p className="font-medium mb-2">{m.title}</p>
                    <div className="space-y-1">{m.options.map((opt: string, j: number) => <p key={j} className="text-sm font-mono text-muted-foreground">{opt}</p>)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">{menuFlow.map((m: any, i: number) => (
                <div key={i} className="p-4 border rounded-lg">
                  <p className="font-medium mb-2">{m.title}</p>
                  <div className="space-y-1">{(m.options ?? []).map((opt: string, j: number) => <p key={j} className="text-sm font-mono text-muted-foreground">{opt}</p>)}</div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
