import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, Clock, XCircle, Building2, User } from "lucide-react";

const statusIcon = (s: string) => {
  if (s === "completed" || s === "approved") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (s === "failed" || s === "rejected") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "completed" || s === "approved") return "default";
  if (s === "failed" || s === "rejected") return "destructive";
  if (s === "in_progress") return "secondary";
  return "outline";
};

export default function KYBVerification() {
  const utils = trpc.useUtils();
  const { data: verifications, isLoading, error } = trpc.orphaned.kyb.listVerifications.useQuery(undefined, { staleTime: 30_000 });
  const { data: directors } = trpc.orphaned.kyb.listDirectors.useQuery(undefined, { staleTime: 30_000 });
  const [showStart, setShowStart] = useState(false);
  const [showAddDirector, setShowAddDirector] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [rcNumber, setRcNumber] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [bvn, setBvn] = useState("");

  const startVerification = trpc.orphaned.kyb.startVerification.useMutation({
    onSuccess: () => {
      utils.orphaned.kyb.listVerifications.invalidate();
      setShowStart(false);
      setBusinessName("");
      setRcNumber("");
      toast.success("KYB verification started");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const addDirector = trpc.orphaned.kyb.addDirector.useMutation({
    onSuccess: () => {
      utils.orphaned.kyb.listDirectors.invalidate();
      setShowAddDirector(false);
      setDirectorName("");
      setBvn("");
      toast.success("Director added");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  );

  if (error) return <BridgeEmptyState title="KYB Unavailable" description={error.message} onRetry={() => utils.orphaned.kyb.listVerifications.invalidate()} />;

  const verificationList = verifications ?? [];
  const directorList = directors ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="w-6 h-6" /> KYB Verification</h1>
          <p className="text-muted-foreground text-sm mt-1">Know Your Business — verify your business identity for compliance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddDirector(true)}><User className="w-4 h-4 mr-2" /> Add Director</Button>
          <Button onClick={() => setShowStart(true)}>Start Verification</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Verification History</h2>
          {verificationList.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No verifications started yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {verificationList.map((v) => (
                <Card key={v.verificationId}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{v.businessName}</p>
                      <p className="text-xs text-muted-foreground">RC: {v.rcNumber ?? "—"} · {new Date(v.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusIcon(v.status ?? "pending")}
                      <Badge variant={statusVariant(v.status ?? "pending")} className="text-xs">{v.status ?? "pending"}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-3">Directors ({directorList.length})</h2>
          {directorList.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No directors added yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {directorList.map((d) => (
                <Card key={d.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.fullName}</p>
                      <p className="text-xs text-muted-foreground">BVN: {d.bvn ?? "—"} · NIN: {d.nin ?? "—"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">Director</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Start Verification Dialog */}
      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start KYB Verification</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Business Name</Label>
              <Input placeholder="Acme Ltd" value={businessName} onChange={e => setBusinessName(e.target.value)} />
            </div>
            <div>
              <Label>RC Number (optional)</Label>
              <Input placeholder="RC1234567" value={rcNumber} onChange={e => setRcNumber(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button disabled={!businessName || startVerification.isPending} onClick={() => startVerification.mutate({ businessName, rcNumber: rcNumber || undefined })}>
              {startVerification.isPending ? "Starting..." : "Start Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Director Dialog */}
      <Dialog open={showAddDirector} onOpenChange={setShowAddDirector}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Director / UBO</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input placeholder="John Doe" value={directorName} onChange={e => setDirectorName(e.target.value)} />
            </div>
            <div>
              <Label>BVN (optional)</Label>
              <Input placeholder="12345678901" value={bvn} onChange={e => setBvn(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDirector(false)}>Cancel</Button>
            <Button disabled={!directorName || addDirector.isPending} onClick={() => addDirector.mutate({ fullName: directorName, bvn: bvn || undefined })}>
              {addDirector.isPending ? "Adding..." : "Add Director"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
