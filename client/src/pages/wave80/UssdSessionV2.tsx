import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, BarChart3, GitBranch, TrendingDown, Settings } from "lucide-react";
export default function UssdSessionV2() {
  const [tab, setTab] = useState("analytics");
  const menuFlow = [
    { id: "m1", title: "Main Menu", options: ["1. Check Balance","2. Transfer Money","3. Buy Airtime","4. Pay Bills","0. Exit"] },
    { id: "m2", title: "Transfer Money", options: ["1. Bank Transfer","2. Mobile Money","3. PayGate Wallet","0. Back"] },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">USSD Session V2</h1><p className="text-muted-foreground">Stateful USSD menus, session analytics, and drop-off analysis</p></div>
        <Button variant="outline"><Settings className="w-4 h-4 mr-2" />Configure Menu</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Phone className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">12,450</p><p className="text-sm text-muted-foreground">Sessions (7d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><BarChart3 className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">8,920</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingDown className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">3,530</p><p className="text-sm text-muted-foreground">Abandoned</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><GitBranch className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">45s</p><p className="text-sm text-muted-foreground">Avg Duration</p></div></div></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="analytics">Analytics</TabsTrigger><TabsTrigger value="menu">Menu Flow</TabsTrigger></TabsList>
        <TabsContent value="menu">
          <Card><CardHeader><CardTitle>USSD Menu Structure</CardTitle></CardHeader><CardContent>
            <div className="space-y-4">{menuFlow.map(m=>(
              <div key={m.id} className="p-4 border rounded-lg">
                <p className="font-medium mb-2">{m.title}</p>
                <div className="space-y-1">{m.options.map((opt,i)=><p key={i} className="text-sm font-mono text-muted-foreground">{opt}</p>)}</div>
              </div>
            ))}</div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="analytics"><Card><CardContent className="pt-6"><p className="text-center text-muted-foreground py-8">Session analytics loading...</p></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
