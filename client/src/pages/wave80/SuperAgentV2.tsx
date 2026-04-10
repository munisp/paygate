import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Users, DollarSign, TrendingUp } from "lucide-react";
export default function SuperAgentV2() {
  const subAgents = [
    { id: "sa1", name: "Emeka Nwosu", commissionRate: 2.5, status: "active", volume: 1250000, commissions: 31250 },
    { id: "sa2", name: "Aisha Bello", commissionRate: 2.0, status: "active", volume: 890000, commissions: 17800 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Super-Agent V2</h1><p className="text-muted-foreground">Manage your sub-agent network</p></div>
        <Button><Users className="w-4 h-4 mr-2" />Add Sub-Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Network className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">2</p><p className="text-sm text-muted-foreground">Sub-Agents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">2</p><p className="text-sm text-muted-foreground">Active</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">2.14M</p><p className="text-sm text-muted-foreground">Network Volume</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">49,050</p><p className="text-sm text-muted-foreground">Commissions</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Sub-Agent Network</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{subAgents.map(sa => (
          <div key={sa.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{sa.name}</p><p className="text-sm text-muted-foreground">Rate: {sa.commissionRate}%</p></div>
            <div className="flex items-center gap-4">
              <p className="font-medium">{(sa.volume/100).toLocaleString()} vol</p>
              <p className="text-green-600 font-medium">{(sa.commissions/100).toLocaleString()} comm</p>
              <Badge>{sa.status}</Badge>
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
