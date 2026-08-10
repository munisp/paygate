import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertTriangle, Plus, ChevronRight, Clock, CheckCircle2, XCircle, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  escalated: "bg-purple-100 text-purple-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <Clock className="w-3 h-3" />,
  under_review: <AlertTriangle className="w-3 h-3" />,
  resolved: <CheckCircle2 className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
  escalated: <AlertTriangle className="w-3 h-3" />,
};

const CATEGORIES = [
  { value: "unauthorized", label: "Unauthorized transaction" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "not_received", label: "Service/goods not received" },
  { value: "wrong_amount", label: "Wrong amount charged" },
  { value: "fraud", label: "Suspected fraud" },
  { value: "other", label: "Other" },
];

export default function ConsumerDisputes() {
  const [showRaise, setShowRaise] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", description: "", category: "other" as const });

  const { data, isLoading, refetch } = trpc.consumerDisputes.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: detail } = trpc.consumerDisputes.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId , staleTime: 30_000 })
  const raise = trpc.consumerDisputes.raise.useMutation({
    onSuccess: () => {
      toast.success("Dispute raised successfully");
      setShowRaise(false);
      setForm({ subject: "", description: "", category: "other" });
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleRaise = () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    raise.mutate(form);
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Disputes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track and manage transaction disputes</p>
        </div>
        <Button size="sm" onClick={() => setShowRaise(true)} className="gap-1">
          <Plus className="w-4 h-4" />
          Raise Dispute
        </Button>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap">
        {["open", "under_review", "resolved"].map(s => {
          const count = (data?.items ?? []).filter(d => d.status === s).length;
          return (
            <Badge key={s} variant="outline" className={`gap-1 ${STATUS_COLORS[s]}`}>
              {STATUS_ICONS[s]}
              {s.replace("_", " ")} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Disputes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No disputes found</p>
            <p className="text-sm text-muted-foreground mt-1">
              If you have an issue with a transaction, raise a dispute above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(data?.items ?? []).map(d => (
            <Card
              key={d.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(d.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{d.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs gap-1 ${STATUS_COLORS[d.status]}`}>
                      {STATUS_ICONS[d.status]}
                      {d.status.replace("_", " ")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Raise dispute dialog */}
      <Dialog open={showRaise} onOpenChange={setShowRaise}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Raise a Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as typeof form.category }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Subject <span className="text-red-500">*</span></label>
              <Input
                placeholder="Brief description of the issue"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Provide full details of what happened..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground mt-1">{form.description.length}/2000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRaise(false)}>Cancel</Button>
            <Button onClick={handleRaise} disabled={raise.isPending}>
              {raise.isPending ? "Submitting..." : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispute Details</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={`gap-1 ${STATUS_COLORS[detail.status]}`}>
                  {STATUS_ICONS[detail.status]}
                  {detail.status.replace("_", " ")}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(detail.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div>
                <p className="font-semibold">{detail.subject}</p>
                <p className="text-muted-foreground mt-1">{detail.description}</p>
              </div>
              {detail.resolution && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Resolution</p>
                  <p>{detail.resolution}</p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                <p>Category: {CATEGORIES.find(c => c.value === detail.category)?.label ?? detail.category}</p>
                <p>Dispute ID: {detail.id}</p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
