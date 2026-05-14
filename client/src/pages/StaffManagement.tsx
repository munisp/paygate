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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Clock, UserCheck, UserX, Search, Loader2 } from "lucide-react";

export default function StaffManagement() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "cashier", phone: "" });

  const { data: membersData, isLoading } = trpc.staffMgmt.listMembers.useQuery({ page });
  const { data: shiftsData } = trpc.staffMgmt.listShifts.useQuery({ page: 1 });

  const createMember = trpc.staffMgmt.createMember.useMutation({
    onSuccess: () => {
      utils.staffMgmt.listMembers.invalidate();
      setAddOpen(false);
      setForm({ name: "", email: "", role: "cashier", phone: "" });
      toast({ title: "Staff member added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMember = trpc.staffMgmt.deleteMember.useMutation({
    onSuccess: () => {
      utils.staffMgmt.listMembers.invalidate();
      toast({ title: "Staff member removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clockIn = trpc.staffMgmt.clockIn.useMutation({
    onSuccess: () => {
      utils.staffMgmt.listShifts.invalidate();
      toast({ title: "Clocked in" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clockOut = trpc.staffMgmt.clockOut.useMutation({
    onSuccess: () => {
      utils.staffMgmt.listShifts.invalidate();
      toast({ title: "Clocked out" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const members = membersData?.members ?? [];
  const shifts = shiftsData?.shifts ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Staff Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your team members, shifts, and attendance</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Full Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348000000000" /></div>
              <div><Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={createMember.isPending} onClick={() => createMember.mutate(form)}>
                {createMember.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Add Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Staff</p><p className="text-2xl font-bold">{membersData?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Active Shifts</p><p className="text-2xl font-bold">{shifts.filter((s: any) => !s.clockOut).length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Today's Shifts</p><p className="text-2xl font-bold">{shifts.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pages</p><p className="text-2xl font-bold">{Math.ceil((membersData?.total ?? 0) / 20) || 1}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by name or email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : members.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No staff members found. Add your first team member above.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {members.map((m: any) => (
                <Card key={m.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">{m.name?.[0]?.toUpperCase() ?? "?"}</div>
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email} · {m.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.role}</Badge>
                      <Button size="sm" variant="outline" onClick={() => clockIn.mutate({ shiftId: parseInt(m.id) || 0 })}>
                        <UserCheck className="w-3.5 h-3.5 mr-1" />Clock In
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteMember.mutate({ id: m.id })}>
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {Math.ceil((membersData?.total ?? 0) / 20) > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-sm self-center">Page {page} of {Math.ceil((membersData?.total ?? 0) / 20)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil((membersData?.total ?? 0) / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shifts" className="space-y-4">
          {shifts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No shifts recorded today.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {shifts.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{s.memberName ?? s.memberId}</p>
                        <p className="text-xs text-muted-foreground">
                          In: {s.clockIn ? new Date(s.clockIn).toLocaleTimeString() : "—"} · Out: {s.clockOut ? new Date(s.clockOut).toLocaleTimeString() : "Active"}
                        </p>
                      </div>
                    </div>
                    {!s.clockOut && (
                      <Button size="sm" variant="outline" onClick={() => clockOut.mutate({ shiftId: s.id })}>
                        Clock Out
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
