import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Plus, Search, Trash2, CheckCircle2, XCircle } from "lucide-react";

export default function BeneficiaryRegistry() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", accountNumber: "", bankCode: "", currency: "NGN", accountType: "personal", dfspId: "" });

  const { data: beneficiaries, refetch } = trpc.wave221.beneficiaryRegistry.list.useQuery({ search: search || undefined });
  const create = trpc.wave221.beneficiaryRegistry.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setForm({ name: "", accountNumber: "", bankCode: "", currency: "NGN", accountType: "personal", dfspId: "" }); toast.success("Beneficiary registered"); },
    onError: (e) => toast.error(e.message),
  });
  const verify = trpc.wave221.beneficiaryRegistry.verify.useMutation({
    onSuccess: () => { refetch(); toast.success("Beneficiary verified"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.wave221.beneficiaryRegistry.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Beneficiary removed"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Beneficiary Registry</h1>
          <p className="text-muted-foreground text-sm">Manage pre-verified beneficiary accounts for fast cross-scheme transfers</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Register Beneficiary
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, account number, or DFSP…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(beneficiaries ?? []).length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No beneficiaries registered yet</p>
          </div>
        )}
        {(beneficiaries ?? []).map((b) => (
          <Card key={b.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{b.name}</span>
                    <Badge variant={b.isVerified ? "default" : "secondary"} className="text-xs">
                      {b.isVerified ? <><CheckCircle2 className="h-3 w-3 mr-1" />Verified</> : "Unverified"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{b.accountNumber}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{b.currency}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{b.accountType}</Badge>
                    {b.dfspId && <Badge variant="outline" className="text-xs">{b.dfspId}</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!b.isVerified && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => verify.mutate({ id: b.id })} disabled={verify.isPending}>Verify</Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => remove.mutate({ id: b.id })} disabled={remove.isPending}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Beneficiary</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: "Full Name", key: "name", placeholder: "e.g. Amaka Okonkwo" },
              { label: "Account Number", key: "accountNumber", placeholder: "e.g. 0123456789" },
              { label: "Bank Code (NIP)", key: "bankCode", placeholder: "e.g. 058" },
              { label: "DFSP ID (optional)", key: "dfspId", placeholder: "e.g. zenithbank-ng" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input placeholder={placeholder} value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["NGN", "GHS", "KES", "ZAR", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Select value={form.accountType} onValueChange={(v) => setForm((p) => ({ ...p, accountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => create.mutate(form)} disabled={!form.name || !form.accountNumber || create.isPending}>
              {create.isPending ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
