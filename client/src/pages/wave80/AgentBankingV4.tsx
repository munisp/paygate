import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Wallet, TrendingUp, Plus, Search } from "lucide-react";

export default function AgentBankingV4() {
  const [search, setSearch] = useState("");
  const agents = [
    { id: "a1", name: "Chukwuemeka Obi", lga: "Ikeja", state: "Lagos", status: "active", float: 250000, txns: 145 },
    { id: "a2", name: "Fatima Aliyu", lga: "Kano Municipal", state: "Kano", status: "active", float: 180000, txns: 98 },
    { id: "a3", name: "Blessing Eze", lga: "Enugu North", state: "Enugu", status: "pending_kyc", float: 0, txns: 0 },
  ];
  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Agent Banking V4</h1><p className="text-muted-foreground">Manage your agent network and float distribution</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Onboard Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Total Agents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wallet className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">₦430K</p><p className="text-sm text-muted-foreground">Float Deployed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">243</p><p className="text-sm text-muted-foreground">Transactions (30d)</p></div></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Agent Network</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4"><Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" /><Button variant="outline"><Search className="w-4 h-4" /></Button></div>
          <div className="space-y-3">{filtered.map(a => (
            <div key={a.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{a.name}</p><p className="text-sm text-muted-foreground">{a.lga}, {a.state}</p></div>
              <div className="flex items-center gap-4">
                <div className="text-right"><p className="font-medium">₦{(a.float / 100).toLocaleString()}</p><p className="text-xs text-muted-foreground">Float</p></div>
                <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                <Button size="sm" variant="outline">Fund Float</Button>
              </div>
            </div>
          ))}</div>
        </CardContent>
      </Card>
    </div>
  );
}
