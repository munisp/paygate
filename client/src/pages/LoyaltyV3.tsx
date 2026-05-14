import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gift, Plus, Users, Star, Award } from "lucide-react";

type Tab = "programs" | "members" | "catalog";

export default function LoyaltyV3() {
  const [tab, setTab] = useState<Tab>("programs");
  const [createProgramOpen, setCreateProgramOpen] = useState(false);
  const [form, setForm] = useState({ name: "", pointsPerNaira: "1", expiryDays: 365 });

  const { data: programsData, isLoading: programsLoading, refetch: refetchPrograms } =
    trpc.loyaltyV3.listPrograms.useQuery({ page: 1, limit: 20 });
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const { data: membersData, isLoading: membersLoading } =
    trpc.loyaltyV3.listMembers.useQuery({ programId: selectedProgramId, page: 1, limit: 20 }, { enabled: !!selectedProgramId });

  const createProgramMutation = trpc.loyaltyV3.createProgram.useMutation({
    onSuccess: () => { toast.success("Loyalty program created"); setCreateProgramOpen(false); refetchPrograms(); },
    onError: (e: any) => toast.error(e.message),
  });

  const programs = programsData?.programs ?? [];
  const members = membersData?.members ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loyalty V3</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage loyalty programs, enrolled members, and reward catalog</p>
        </div>
        <Dialog open={createProgramOpen} onOpenChange={setCreateProgramOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Program</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Loyalty Program</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Program Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Points per Naira</Label><Input value={form.pointsPerNaira} onChange={e => setForm(f => ({ ...f, pointsPerNaira: e.target.value }))} /></div>
              <div><Label>Points Expiry (days)</Label><Input type="number" value={form.expiryDays} onChange={e => setForm(f => ({ ...f, expiryDays: Number(e.target.value) }))} /></div>
              <Button className="w-full" onClick={() => createProgramMutation.mutate({ programName: form.name, pointsPerNaira: parseFloat(form.pointsPerNaira), expiryDays: form.expiryDays })} disabled={createProgramMutation.isPending}>
                {createProgramMutation.isPending ? "Creating…" : "Create Program"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Gift className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-sm text-muted-foreground">Programs</p><p className="text-2xl font-bold">{programsData?.total ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-sm text-muted-foreground">Members</p><p className="text-2xl font-bold">{membersData?.total ?? 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><Award className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-sm text-muted-foreground">Catalog Items</p><p className="text-2xl font-bold">—</p></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["programs", "members", "catalog"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "programs" && (
        <Card>
          <CardHeader><CardTitle>Loyalty Programs</CardTitle></CardHeader>
          <CardContent>
            {programsLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : programs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No loyalty programs yet. Create your first program.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {programs.map((p: any) => (
                  <div key={p.programId} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.pointsPerNaira} pts/₦ · {p.expiryDays}d expiry</p>
                    </div>
                    <Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "members" && (
        <Card>
          <CardHeader><CardTitle>Loyalty Members</CardTitle></CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No members enrolled yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2">Customer ID</th>
                      <th className="text-right py-3 px-2">Points Balance</th>
                      <th className="text-right py-3 px-2">Lifetime Points</th>
                      <th className="text-left py-3 px-2">Tier</th>
                      <th className="text-left py-3 px-2">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m: any) => (
                      <tr key={m.memberId} className="border-b hover:bg-muted/30">
                        <td className="py-3 px-2 font-mono text-xs">{m.customerId}</td>
                        <td className="py-3 px-2 text-right font-medium">{(m.pointsBalance ?? 0).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right">{(m.lifetimePoints ?? 0).toLocaleString()}</td>
                        <td className="py-3 px-2"><Badge variant="outline">{m.tier ?? "bronze"}</Badge></td>
                        <td className="py-3 px-2 text-sm">{m.enrolledAt ? new Date(m.enrolledAt).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "catalog" && (
        <Card>
          <CardHeader><CardTitle>Reward Catalog</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Reward catalog management coming soon</p>
              <p className="text-xs mt-1">Configure redeemable rewards in the Admin panel</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
