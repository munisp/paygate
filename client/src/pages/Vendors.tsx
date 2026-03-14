/**
 * Vendor Directory
 * Manage saved vendor/supplier profiles with CRUD operations.
 * Vendors can be selected from a dropdown when creating Purchase Orders.
 */
import { useState, useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import {
  Building2, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin,
  Clock, CheckCircle2, XCircle, Loader2, Users, Package, FileText,
  MoreVertical, ChevronDown, QrCode, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vendor {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTerms: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date | string;
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  immediate: "Immediate",
  net7: "Net 7 days",
  net14: "Net 14 days",
  net30: "Net 30 days",
  net60: "Net 60 days",
  net90: "Net 90 days",
};

function getTermsBadgeColor(terms: string) {
  if (terms === "immediate") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (terms === "net7" || terms === "net14") return "bg-blue-100 text-blue-700 border-blue-200";
  if (terms === "net30") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-orange-100 text-orange-700 border-orange-200";
}

// ─── Vendor Form Dialog ───────────────────────────────────────────────────────
interface VendorFormDialogProps {
  open: boolean;
  onClose: () => void;
  vendor?: Vendor | null;
  onSaved: () => void;
}

const EMPTY_FORM = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  paymentTerms: "net30" as const,
  notes: "",
};

function VendorFormDialog({ open, onClose, vendor, onSaved }: VendorFormDialogProps) {
  const [form, setForm] = useState(() =>
    vendor
      ? {
          name: vendor.name,
          contactName: vendor.contactName ?? "",
          email: vendor.email ?? "",
          phone: vendor.phone ?? "",
          address: vendor.address ?? "",
          paymentTerms: (vendor.paymentTerms as any) ?? "net30",
          notes: vendor.notes ?? "",
        }
      : { ...EMPTY_FORM }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      toast.success("Vendor created", { description: `${form.name} added to your vendor directory.` });
      utils.vendors.list.invalidate();
      onSaved();
      onClose();
    },
    onError: (err) => toast.error("Failed to create vendor", { description: err.message }),
  });

  const updateMutation = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      utils.vendors.list.invalidate();
      onSaved();
      onClose();
    },
    onError: (err) => toast.error("Failed to update vendor", { description: err.message }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Invalid email address"); return;
    }
    if (vendor) {
      updateMutation.mutate({
        id: vendor.id,
        name: form.name.trim(),
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        paymentTerms: form.paymentTerms,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        paymentTerms: form.paymentTerms,
        notes: form.notes || undefined,
      });
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            {vendor ? "Edit Vendor" : "Add New Vendor"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Vendor / Supplier Name <span className="text-red-500">*</span></Label>
            <Input placeholder="e.g. FreshFarm Supplies Ltd" value={form.name} onChange={set("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input placeholder="e.g. Emeka Obi" value={form.contactName} onChange={set("contactName")} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+234 800 000 0000" value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="vendor@example.com" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input placeholder="e.g. 12 Adeola Odeku St, Victoria Island, Lagos" value={form.address} onChange={set("address")} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <Select
              value={form.paymentTerms}
              onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Preferred delivery days, special instructions, etc."
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {vendor ? "Save Changes" : "Add Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QR Code Dialog ──────────────────────────────────────────────────────────
function VendorQRDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  if (!vendor) return null;

  // Build a vCard-style contact string for the QR code
  const vcard = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${vendor.name}`,
    vendor.contactName ? `N:${vendor.contactName};;;` : "",
    vendor.phone ? `TEL;TYPE=WORK:${vendor.phone}` : "",
    vendor.email ? `EMAIL;TYPE=WORK:${vendor.email}` : "",
    vendor.address ? `ADR;TYPE=WORK:;;${vendor.address};;;;` : "",
    vendor.notes ? `NOTE:${vendor.notes}` : "",
    "END:VCARD",
  ].filter(Boolean).join("\n");

  const handleDownload = () => {
    const svg = document.getElementById(`vendor-qr-${vendor.id}`);
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${vendor.name.replace(/\s+/g, "-").toLowerCase()}-contact-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!vendor} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-blue-600" />
            {vendor.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
            <QRCodeSVG
              id={`vendor-qr-${vendor.id}`}
              value={vcard}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground px-2">
            Scan to save <strong>{vendor.name}</strong> as a contact. Contains name, phone, email, and address.
          </p>
          <Button variant="outline" size="sm" onClick={handleDownload} className="w-full">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download QR (SVG)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirmation Dialog ───────────────────────────────────────────────
function DeleteVendorDialog({
  vendor,
  onClose,
  onDeleted,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.vendors.delete.useMutation({
    onSuccess: () => {
      toast.success("Vendor deleted");
      utils.vendors.list.invalidate();
      onDeleted();
      onClose();
    },
    onError: (err) => toast.error("Failed to delete vendor", { description: err.message }),
  });

  return (
    <Dialog open={!!vendor} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Delete Vendor
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Are you sure you want to delete <strong>{vendor?.name}</strong>? This action cannot be undone.
          Existing purchase orders referencing this vendor will not be affected.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => vendor && deleteMutation.mutate({ id: vendor.id })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete Vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Vendors() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [qrVendor, setQrVendor] = useState<Vendor | null>(null);

  const { data, isLoading, refetch } = trpc.vendors.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const { data: statsData } = trpc.vendors.stats.useQuery(undefined, {
    staleTime: 30_000,
  });
  const { data: historyData } = trpc.vendors.spendHistory.useQuery(undefined, {
    staleTime: 60_000,
  });

  const vendors: Vendor[] = data?.vendors ?? [];
  // Build a lookup map: vendorId -> { poCount, totalSpendKobo }
  const statsMap = useMemo(() => {
    const m: Record<string, { poCount: number; totalSpendKobo: number }> = {};
    (statsData?.stats ?? []).forEach((s) => { m[s.vendorId] = s; });
    return m;
  }, [statsData]);
  // Build a lookup map: vendorId -> monthly spend array for sparkline
  const historyMap = useMemo(() => {
    const m: Record<string, Array<{ month: string; spendKobo: number }>> = {};
    (historyData?.history ?? []).forEach((h: any) => { m[h.vendorId] = h.months; });
    return m;
  }, [historyData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vendors;
    const q = search.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.phone?.includes(q) ||
        v.address?.toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const activeCount = vendors.filter((v) => v.isActive).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            Vendor Directory
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your supplier profiles — select vendors when creating Purchase Orders.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Vendor
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Vendors", value: vendors.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Active", value: activeCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Inactive", value: vendors.length - activeCount, icon: XCircle, color: "text-muted-foreground", bg: "bg-muted" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-lg font-bold leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search vendors by name, contact, email, or phone…"
          className="pl-8 h-9 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Vendor cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">
              {search ? "No vendors match your search" : "No vendors yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? "Try a different search term."
                : "Add your first vendor to start building your supplier directory."}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add First Vendor
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((vendor) => (
            <Card key={vendor.id} className={`relative ${!vendor.isActive ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4.5 w-4.5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{vendor.name}</CardTitle>
                      {vendor.contactName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />
                          {vendor.contactName}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setQrVendor(vendor)}>
                        <QrCode className="h-3.5 w-3.5 mr-2" />
                        Show QR Code
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditVendor(vendor)}>
                        <Edit2 className="h-3.5 w-3.5 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleteVendor(vendor)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {/* Contact info */}
                <div className="space-y-1">
                  {vendor.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <a href={`mailto:${vendor.email}`} className="hover:text-foreground truncate">
                        {vendor.email}
                      </a>
                    </div>
                  )}
                  {vendor.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      <a href={`tel:${vendor.phone}`} className="hover:text-foreground">
                        {vendor.phone}
                      </a>
                    </div>
                  )}
                  {vendor.address && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{vendor.address}</span>
                    </div>
                  )}
                </div>

                {/* Payment terms */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getTermsBadgeColor(vendor.paymentTerms)}`}>
                      {PAYMENT_TERMS_LABELS[vendor.paymentTerms] ?? vendor.paymentTerms}
                    </span>
                  </div>
                  {!vendor.isActive && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                  )}
                </div>

                {/* Notes */}
                {vendor.notes && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border">
                    <FileText className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{vendor.notes}</span>
                  </div>
                )}

                {/* Spend Trend Sparkline */}
                {(() => {
                  const months = historyMap[vendor.id];
                  if (!months || months.length < 2) return null;
                  const chartData = months.map((m) => ({
                    month: m.month,
                    spend: Math.round(m.spendKobo / 100),
                  }));
                  const maxSpend = Math.max(...chartData.map((d) => d.spend));
                  return maxSpend > 0 ? (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground mb-0.5">6-month spend trend</p>
                      <ResponsiveContainer width="100%" height={36}>
                        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`grad-${vendor.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Tooltip
                            content={({ active, payload }) =>
                              active && payload?.[0] ? (
                                <div className="bg-popover border border-border rounded px-2 py-1 text-xs shadow">
                                  <span className="font-medium">{payload[0].payload.month}</span>:{" "}
                                  <span className="text-emerald-600">₦{Number(payload[0].value).toLocaleString()}</span>
                                </div>
                              ) : null
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="spend"
                            stroke="#10b981"
                            strokeWidth={1.5}
                            fill={`url(#grad-${vendor.id})`}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null;
                })()}
                {/* Performance metrics */}
                {(() => {
                  const s = statsMap[vendor.id];
                  const poCount = s?.poCount ?? 0;
                  const spendNgn = ((s?.totalSpendKobo ?? 0) / 100).toLocaleString("en-NG", {
                    style: "currency",
                    currency: "NGN",
                    maximumFractionDigits: 0,
                  });
                  return (
                    <div className="flex items-center gap-3 pt-2 border-t border-border">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        <span className="font-semibold">{poCount}</span>
                        <span className="text-muted-foreground">PO{poCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">•</span>
                        <span className="font-semibold text-emerald-700">{spendNgn}</span>
                        <span className="text-muted-foreground">total spend</span>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <VendorFormDialog
        open={showForm || !!editVendor}
        onClose={() => { setShowForm(false); setEditVendor(null); }}
        vendor={editVendor}
        onSaved={refetch}
      />
      <DeleteVendorDialog
        vendor={deleteVendor}
        onClose={() => setDeleteVendor(null)}
        onDeleted={refetch}
      />
      <VendorQRDialog
        vendor={qrVendor}
        onClose={() => setQrVendor(null)}
      />
    </div>
  );
}
