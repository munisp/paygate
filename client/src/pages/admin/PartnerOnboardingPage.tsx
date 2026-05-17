import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Eye, CheckCircle, Clock, Building2 } from "lucide-react";
import { format } from "date-fns";

export default function PartnerOnboardingPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const { data, refetch, isLoading } = trpc.wave32.partnerOnboarding.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
  }, { staleTime: 30_000 });

  const { data: session } = trpc.wave32.partnerOnboarding.getSession.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId , staleTime: 30_000 })

  const startMutation = trpc.wave32.partnerOnboarding.startSession.useMutation({
    onSuccess: (s) => {
      toast({ title: "Onboarding session started", description: `Session ID: ${s.id}` });
      setShowStart(false);
      setInviteCode("");
      refetch();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = trpc.wave32.partnerOnboarding.updateStep.useMutation({
    onSuccess: () => { toast({ title: "Step updated" }); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const STEPS = ["invite_code", "company_info", "branding", "fee_structure", "review", "completed"];
  const stepLabels: Record<string, string> = {
    invite_code: "Invite Code",
    company_info: "Company Info",
    branding: "Branding",
    fee_structure: "Fee Structure",
    review: "Review",
    completed: "Completed",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partner Onboarding</h1>
          <p className="text-muted-foreground">Manage partner onboarding sessions and progress.</p>
        </div>
        <Button onClick={() => setShowStart(true)}><Building2 className="h-4 w-4 mr-2" />Start Session</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Sessions", value: data?.total ?? 0, icon: Building2 },
          { label: "Completed", value: data?.items?.filter(s => s.isCompleted).length ?? 0, icon: CheckCircle },
          { label: "In Progress", value: data?.items?.filter(s => !s.isCompleted).length ?? 0, icon: Clock },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-6 flex items-center gap-4">
              <stat.icon className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by company name..." className="pl-9" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {["Company", "Current Step", "Status", "Started", "Completed At", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No onboarding sessions found</td></tr>
              ) : data?.items?.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.companyName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                      {stepLabels[s.currentStep ?? "invite_code"] ?? s.currentStep}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.isCompleted ? (
                      <Badge className="bg-green-600">Completed</Badge>
                    ) : (
                      <Badge variant="secondary">In Progress</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(s.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.completedAt ? format(new Date(s.completedAt), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(s.id)}>
                      <Eye className="h-3 w-3 mr-1" />View
                    </Button>
                    {!s.isCompleted && (
                      <Button size="sm" variant="ghost" className="text-green-600"
                        onClick={() => updateMutation.mutate({ id: s.id, step: "completed", data: {} })}>
                        Complete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Session Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Onboarding Session Detail</DialogTitle></DialogHeader>
          {session && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Session ID:</span> <span className="font-mono text-xs">{session.id}</span></div>
                <div><span className="font-medium">Company:</span> {session.companyName ?? "Not set"}</div>
                <div><span className="font-medium">Invite Code:</span> {session.inviteCode ?? "None"}</div>
                <div><span className="font-medium">Status:</span> {session.isCompleted ? "Completed" : "In Progress"}</div>
              </div>

              {/* Step Progress */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Onboarding Progress</Label>
                <div className="flex gap-2 flex-wrap">
                  {STEPS.map((step, i) => {
                    const currentIdx = STEPS.indexOf(session.currentStep ?? "invite_code");
                    const isDone = i < currentIdx || session.isCompleted;
                    const isCurrent = step === session.currentStep && !session.isCompleted;
                    return (
                      <div key={step} className={`px-3 py-1.5 rounded text-xs font-medium ${
                        isDone ? "bg-green-100 text-green-800" :
                        isCurrent ? "bg-blue-100 text-blue-800 ring-1 ring-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {i + 1}. {stepLabels[step]}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advance Step */}
              {!session.isCompleted && (
                <div className="flex gap-2 pt-2">
                  {STEPS.filter((_, i) => i > STEPS.indexOf(session.currentStep ?? "invite_code")).map(nextStep => (
                    <Button key={nextStep} size="sm" variant="outline"
                      onClick={() => updateMutation.mutate({ id: session.id, step: nextStep as any, data: {} })}>
                      Advance to {stepLabels[nextStep]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Start Session Dialog */}
      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start Onboarding Session</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Invite Code (optional)</Label>
              <Input placeholder="PG-XXXXXXXX" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to start without an invite code.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button onClick={() => startMutation.mutate({ inviteCode: inviteCode || undefined })} disabled={startMutation.isPending}>
              {startMutation.isPending ? "Starting..." : "Start Session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
