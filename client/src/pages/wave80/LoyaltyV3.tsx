import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy, Star, Users, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function LoyaltyV3() {
  const [awardOpen, setAwardOpen] = useState(false);
  const [form, setForm] = useState({ customerId: "", customerEmail: "", points: "100" });

  const { data: programData } = trpc.wave80.loyaltyV3.getProgram.useQuery();
  const { data: membersData, isLoading: loadingMembers, refetch } = trpc.wave80.loyaltyV3.listMembers.useQuery({});

  const awardPoints = trpc.wave80.loyaltyV3.awardPoints.useMutation({
    onSuccess: () => { toast.success("Points awarded"); setAwardOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const redeemPoints = trpc.wave80.loyaltyV3.redeemPoints.useMutation({
    onSuccess: () => { toast.success("Points redeemed"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const program = programData?.program;
  const members = membersData?.members ?? [];
  const totalPoints = members.reduce((s: any, m: any) => s + m.pointsBalance, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Loyalty V3</h1><p className="text-muted-foreground">Tiered rewards and member engagement</p></div>
        <Button onClick={() => setAwardOpen(true)}><Plus className="w-4 h-4 mr-2" />Award Points</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{members.length}</p><p className="text-sm text-muted-foreground">Members</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Star className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{totalPoints.toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Points</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Trophy className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{program?.programName ?? "No Program"}</p><p className="text-sm text-muted-foreground">Active Program</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Members</CardTitle></CardHeader><CardContent>
        {loadingMembers ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        members.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No members yet. Award points to get started.</p></div> : (
          <div className="space-y-3">{members.map((m: any, i: any) => (
            <div key={m.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3"><span className="text-2xl font-bold text-muted-foreground">#{i+1}</span><div><p className="font-medium">{m.customerEmail}</p><p className="text-sm text-muted-foreground">ID: {m.customerId}</p></div></div>
              <div className="flex items-center gap-3">
                <p className="font-bold">{m.pointsBalance.toLocaleString()} pts</p>
                <Badge>{m.tier}</Badge>
                {m.pointsBalance > 0 && <Button size="sm" variant="outline" onClick={() => redeemPoints.mutate({ memberId: m.id, points: Math.min(100, m.pointsBalance) })}>Redeem 100</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={awardOpen} onOpenChange={setAwardOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Award Points</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Customer ID</Label><Input value={form.customerId} onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Customer Email</Label><Input value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Points</Label><Input type="number" value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAwardOpen(false)}>Cancel</Button>
            <Button onClick={() => awardPoints.mutate({ customerId: form.customerId, customerEmail: form.customerEmail, points: parseInt(form.points) })} disabled={awardPoints.isPending}>{awardPoints.isPending ? "Awarding..." : "Award Points"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
