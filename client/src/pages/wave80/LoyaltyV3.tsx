import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Trophy, Plus } from "lucide-react";
export default function LoyaltyV3() {
  const tiers = [
    { name: "Bronze", members: 1250 },
    { name: "Silver", members: 380 },
    { name: "Gold", members: 95 },
    { name: "Platinum", members: 12 },
  ];
  const topMembers = [
    { name: "Adaeze Okonkwo", points: 45200, tier: "Platinum" },
    { name: "Tunde Fashola", points: 28900, tier: "Gold" },
    { name: "Ngozi Adeyemi", points: 22100, tier: "Gold" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Loyalty V3</h1><p className="text-muted-foreground">Tiered rewards and member engagement</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Create Program</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {tiers.map(t => (
          <Card key={t.name}><CardContent className="pt-6"><div className="flex items-center gap-3"><Trophy className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{t.members.toLocaleString()}</p><p className="text-sm text-muted-foreground">{t.name} Members</p></div></div></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Top Members</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{topMembers.map((m, i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3"><span className="text-2xl font-bold text-muted-foreground">#{i+1}</span><p className="font-medium">{m.name}</p></div>
            <div className="flex items-center gap-3"><p className="font-bold"><Star className="w-4 h-4 inline text-yellow-500 mr-1" />{m.points.toLocaleString()} pts</p><Badge>{m.tier}</Badge></div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
