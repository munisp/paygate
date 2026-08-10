// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Monitor, Plus, Trash2, RefreshCw, Search, MapPin, Wifi, WifiOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function POSTerminalManagement() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: terminals, refetch, isLoading } = trpc.wave223.posTerminals.list.useQuery({ search });

  const createMutation = trpc.wave223.posTerminals.create.useMutation({
    onSuccess: () => { toast.success("Terminal registered."); setOpen(false); setForm({}); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave223.posTerminals.delete.useMutation({
    onSuccess: () => { toast.success("Terminal removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = () => {
    if (!form.terminalId || !form.serialNumber || !form.terminalType) {
      toast.error("Fill required fields."); return;
    }
    createMutation.mutate({
      terminalId: form.terminalId,
      serialNumber: form.serialNumber,
      terminalType: form.terminalType as any,
      merchantId: form.merchantId,
      branchName: form.branchName,
      location: form.location,
      ptspCode: form.ptspCode,
    });
  };

  const statusColor = (status: string) => {
    if (status === "active") return "default";
    if (status === "inactive") return "secondary";
    if (status === "suspended") return "destructive";
    return "outline";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Monitor className="h-6 w-6 text-orange-500" /> POS Terminal Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Register, monitor, and manage payment terminals across all branches</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} size="sm"><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Register Terminal</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Terminals", value: terminals?.length ?? 0, icon: Monitor },
          { label: "Active", value: terminals?.filter((t) => t.status === "active").length ?? 0, icon: Wifi, color: "text-green-500" },
          { label: "Inactive", value: terminals?.filter((t) => t.status === "inactive").length ?? 0, icon: WifiOff, color: "text-muted-foreground" },
          { label: "Suspended", value: terminals?.filter((t) => t.status === "suspended").length ?? 0, icon: WifiOff, color: "text-red-500" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 bg-muted/40">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color ?? "text-muted-foreground"}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by terminal ID, serial, branch…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Terminal ID</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>PTSP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading terminals…</TableCell></TableRow>
              )}
              {!isLoading && !terminals?.length && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No terminals registered yet. Click "Register Terminal" to add one.</TableCell></TableRow>
              )}
              {terminals?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm font-medium">{t.terminalId}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{t.serialNumber}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{t.terminalType?.replace(/_/g, ' ')}</Badge>
                  </TableCell>
                  <TableCell>{t.branchName ?? "—"}</TableCell>
                  <TableCell>
                    {t.location ? (
                      <span className="flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{t.location}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{t.ptspCode ?? "—"}</TableCell>
                  <TableCell><Badge variant={statusColor(t.status ?? "inactive")}>{t.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: t.id })}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Register Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Register POS Terminal</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Terminal ID <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. TID001234" value={form.terminalId ?? ""} onChange={(e) => set("terminalId", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Serial Number <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. SN-ABC-123456" value={form.serialNumber ?? ""} onChange={(e) => set("serialNumber", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Terminal Type <span className="text-destructive">*</span></Label>
              <Select value={form.terminalType ?? ""} onValueChange={(v) => set("terminalType", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Standalone POS</SelectItem>
                  <SelectItem value="mpos">mPOS (Mobile)</SelectItem>
                  <SelectItem value="android_pos">Android POS</SelectItem>
                  <SelectItem value="soundbox">Soundbox / QR</SelectItem>
                  <SelectItem value="kiosk">Self-service Kiosk</SelectItem>
                  <SelectItem value="atm">ATM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>PTSP Code</Label>
              <Input placeholder="e.g. PTSP001" value={form.ptspCode ?? ""} onChange={(e) => set("ptspCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input placeholder="e.g. Ikeja Branch" value={form.branchName ?? ""} onChange={(e) => set("branchName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="e.g. 10 Allen Ave, Ikeja, Lagos" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Registering…" : "Register Terminal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
