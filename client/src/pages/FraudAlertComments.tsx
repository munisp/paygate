import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, RefreshCw, Plus, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const ACTION_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-800",
  escalate: "bg-orange-100 text-orange-800",
  resolve: "bg-green-100 text-green-800",
  dismiss: "bg-gray-100 text-gray-600",
  flag: "bg-red-100 text-red-800",
};

export default function FraudAlertComments() {
  const [page, setPage] = useState(0);
  const [alertIdFilter, setAlertIdFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ alertId: "", comment: "", action: "note" });

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.fraudAlertComments.list.useQuery({
    limit,
    offset: page * limit,
    alertId: alertIdFilter ? Number(alertIdFilter) : undefined,
  });

  const addMutation = trpc.fraudAlertComments.add.useMutation({
    onSuccess: () => {
      toast.success("Comment added");
      setShowAdd(false);
      setForm({ alertId: "", comment: "", action: "note" });
      utils.fraudAlertComments.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fraud Alert Comments</h1>
          <p className="text-muted-foreground text-sm mt-1">Investigator notes and actions on fraud alerts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Comment
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Filter by Alert ID…"
          value={alertIdFilter}
          onChange={(e) => { setAlertIdFilter(e.target.value); setPage(0); }}
          className="max-w-xs"
          type="number"
        />
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} comments</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load comments.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alert ID</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No comments found</TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <span className="font-mono font-semibold">#{r.alertId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[r.action] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.action}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-sm line-clamp-2">{r.comment}</p>
                    </TableCell>
                    <TableCell className="text-sm">{r.authorName ?? `User #${r.authorId}`}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Add Comment Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Fraud Alert Comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Alert ID</Label>
              <Input
                type="number"
                placeholder="e.g. 1234"
                value={form.alertId}
                onChange={(e) => setForm((f) => ({ ...f, alertId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Action</Label>
              <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                  <SelectItem value="resolve">Resolve</SelectItem>
                  <SelectItem value="dismiss">Dismiss</SelectItem>
                  <SelectItem value="flag">Flag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comment</Label>
              <Textarea
                placeholder="Enter investigation notes…"
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.alertId || !form.comment) return toast.error("Alert ID and comment are required");
                addMutation.mutate({ alertId: Number(form.alertId), comment: form.comment, action: form.action as any });
              }}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? "Saving…" : "Add Comment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
