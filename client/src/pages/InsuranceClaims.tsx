import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ShieldPlus, Plus, CheckCircle, XCircle, DollarSign, Loader2, Search } from "lucide-react";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  paid: "outline",
};

export default function InsuranceClaims() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ policyId: "", claimType: "health", amount: "", description: "" });

  const { data, isLoading } = trpc.insuranceClaims.list.useQuery({
    page,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const createClaim = trpc.insuranceClaims.create.useMutation({
    onSuccess: () => {
      utils.insuranceClaims.list.invalidate();
      setAddOpen(false);
      setForm({ policyId: "", claimType: "health", amount: "", description: "",
      onError: (e) => toast.error(e.message),
    });
      toast({ title: "Claim submitted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveClaim = trpc.insuranceClaims.approve.useMutation({
    onSuccess: () => { utils.insuranceClaims.list.invalidate(); toast({ title: "Claim approved",
      onError: (e) => toast.error(e.message),
    }); },
  });

  const rejectClaim = trpc.insuranceClaims.reject.useMutation({
    onSuccess: () => { utils.insuranceClaims.list.invalidate(); toast({ title: "Claim rejected",
      onError: (e) => toast.error(e.message),
    }); },
  });

  const payClaim = trpc.insuranceClaims.pay.useMutation({
    onSuccess: () => { utils.insuranceClaims.list.invalidate(); toast({ title: "Claim paid",
      onError: (e) => toast.error(e.message),
    }); },
  });

  const claims = data?.claims ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldPlus className="w-6 h-6" /> Insurance Claims</h1>
          <p className="text-muted-foreground text-sm mt-1">Submit and manage insurance claims</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Claim</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Insurance Claim</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Policy ID</Label><Input value={form.policyId} onChange={e => setForm(f => ({ ...f, policyId: e.target.value }))} placeholder="POL-000001" /></div>
              <div><Label>Claim Type</Label>
                <Select value={form.claimType} onValueChange={v => setForm(f => ({ ...f, claimType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="health">Health</SelectItem>
                    <SelectItem value="life">Life</SelectItem>
                    <SelectItem value="property">Property</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="travel">Travel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Claim Amount (NGN)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="50000" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the claim..." /></div>
              <Button className="w-full" disabled={createClaim.isPending} onClick={() => createClaim.mutate({ ...form, amount: Number(form.amount) })}>
                {createClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Submit Claim
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Claims</p><p className="text-2xl font-bold">{data?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-yellow-600">{claims.filter((c: any) => c.status === "pending").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Approved</p><p className="text-2xl font-bold text-green-600">{claims.filter((c: any) => c.status === "approved").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Paid</p><p className="text-2xl font-bold text-blue-600">{claims.filter((c: any) => c.status === "paid").length}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : claims.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No claims found.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {claims.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={STATUS_COLORS[c.status] ?? "secondary"}>{c.status}</Badge>
                    <Badge variant="outline">{c.claimType}</Badge>
                    <span className="text-xs text-muted-foreground">{c.id?.slice(0, 8)}</span>
                  </div>
                  <p className="text-sm">{c.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">Policy: {c.policyId} · Amount: ₦{Number(c.amount ?? 0).toLocaleString()}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {c.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => approveClaim.mutate({ id: c.id })}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectClaim.mutate({ id: c.id, reason: "Rejected by admin" })}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                      </Button>
                    </>
                  )}
                  {c.status === "approved" && (
                    <Button size="sm" onClick={() => payClaim.mutate({ id: c.id })}>
                      <DollarSign className="w-3.5 h-3.5 mr-1" />Pay
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(data?.pages ?? 1) > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="text-sm self-center">Page {page} of {data?.pages}</span>
          <Button variant="outline" size="sm" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
