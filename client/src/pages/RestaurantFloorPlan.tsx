import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Users, TrendingUp, Clock, BarChart3 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  available: "#22c55e",
  occupied: "#ef4444",
  reserved: "#f59e0b",
  cleaning: "#6366f1",
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  cleaning: "Cleaning",
};

export default function RestaurantFloorPlan() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tableNumber: "", capacity: "4", section: "main" });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.restaurant.listTables.useQuery(
    undefined,
    { enabled: isAuthenticated , staleTime: 30_000 })

  const createTable = trpc.restaurant.createTable.useMutation({
    onSuccess: () => {
      toast.success("Table created");
      refetch();
      setOpen(false);
      setForm({ tableNumber: "", capacity: "4", section: "main" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = trpc.restaurant.updateTableStatus.useMutation({
    onSuccess: () => {
      utils.restaurant.listTables.invalidate();
    },
  });

  const updatePosition = trpc.restaurant.updateTablePosition.useMutation();

  const { data: turnStats } = trpc.restaurant.tableTurnStats.useQuery({}, {
    staleTime: 60_000,
  });

  const tables: any[] = data ?? [];

  const handleMouseDown = (e: React.MouseEvent, tableId: string) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(tableId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - canvasRect.left - dragOffset.x, canvasRect.width - 80));
    const y = Math.max(0, Math.min(e.clientY - canvasRect.top - dragOffset.y, canvasRect.height - 80));
    updatePosition.mutate({ id: dragging, posX: x, posY: y });
  }, [dragging, dragOffset, updatePosition]);

  const handleMouseUp = () => setDragging(null);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Restaurant Floor Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Drag tables to position them. Click a table to change its status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Table</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Table</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Table Number (e.g. T1, A3)" value={form.tableNumber} onChange={(e: any) => setForm({ ...form, tableNumber: e.target.value })} />
                <Input type="number" placeholder="Capacity" min={1} max={50} value={form.capacity} onChange={(e: any) => setForm({ ...form, capacity: e.target.value })} />
                <Input placeholder="Section (main, patio, bar…)" value={form.section} onChange={(e: any) => setForm({ ...form, section: e.target.value })} />
                <Button className="w-full" disabled={!form.tableNumber} onClick={() => createTable.mutate({ tableNumber: form.tableNumber, capacity: parseInt(form.capacity) || 4, section: form.section })}>
                  Create Table
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span>{STATUS_LABELS[status]}</span>
          </div>
        ))}
      </div>

      {/* Floor plan canvas */}
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="h-96 flex items-center justify-center text-muted-foreground">Loading floor plan…</div>
          ) : tables.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-muted-foreground">
              <Users className="w-12 h-12 mb-3 opacity-30" />
              <p>No tables yet. Add your first table to get started.</p>
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="relative bg-muted/20 rounded-lg border-2 border-dashed border-muted"
              style={{ height: 500, userSelect: "none" }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {tables.map((table: any) => (
                <div
                  key={table.id}
                  className="absolute cursor-grab active:cursor-grabbing rounded-xl shadow-md flex flex-col items-center justify-center text-white text-xs font-bold select-none transition-shadow hover:shadow-lg"
                  style={{
                    left: table.posX ?? 20,
                    top: table.posY ?? 20,
                    width: 72,
                    height: 72,
                    backgroundColor: STATUS_COLORS[table.status] ?? "#6b7280",
                  }}
                  onMouseDown={(e: any) => handleMouseDown(e, table.id)}
                  onClick={() => {
                    // Cycle status on click
                    const statuses = ["available", "occupied", "reserved", "cleaning"];
                    const next = statuses[(statuses.indexOf(table.status) + 1) % statuses.length];
                    updateStatus.mutate({ id: table.id, status: next as any });
                  }}
                >
                  <span className="text-base">{table.tableNumber}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <Users className="w-2.5 h-2.5" />
                    <span>{table.capacity}</span>
                  </div>
                  <span className="text-[9px] opacity-80">{table.section}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table list */}
      <Card>
        <CardHeader><CardTitle>Table Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Table</th>
                  <th className="text-left py-2 pr-4">Section</th>
                  <th className="text-left py-2 pr-4">Capacity</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{t.tableNumber}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{t.section}</td>
                    <td className="py-2 pr-4">{t.capacity} covers</td>
                    <td className="py-2">
                      <Select
                        value={t.status}
                        onValueChange={(val) => updateStatus.mutate({ id: t.id, status: val as any })}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([v, label]) => (
                            <SelectItem key={v} value={v}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Table Turn Stats */}
      {turnStats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Today's Table Turn Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{(turnStats as any).tablesServed ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Tables Served
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{(turnStats as any).coversServed ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Users className="w-3 h-3" /> Covers
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{Math.round((turnStats as any).avgDwellMinutes ?? 0)}m</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" /> Avg Dwell
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  ₦{(((turnStats as any).revenueKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Revenue Today</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
