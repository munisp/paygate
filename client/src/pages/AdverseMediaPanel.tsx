/**
 * Wave 174 — Adverse Media Screening Panel
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";

export default function AdverseMediaPanel() {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: "", country: "NG", entityType: "merchant" as const });
  const [page, setPage] = useState(1);

  const { data, isLoading: listLoading } = trpc.adverseMedia.list.useQuery({
    page,
    limit: 20,
    flaggedOnly: false,
  });

  const screenMutation = trpc.adverseMedia.screen.useMutation({
    onSuccess: (result) => {
      if (result.flagged) {
        toast.error(`Adverse media flagged: ${result.flagReason ?? "Review required"}`);
      } else {
        toast.success("Screening complete — no adverse media found");
      }
      utils.adverseMedia.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reviewMutation = trpc.adverseMedia.markReviewed.useMutation({
    onSuccess: () => {
      toast.success("Screening marked as reviewed");
      utils.adverseMedia.list.invalidate();
    },
  });

  const handleScreen = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    screenMutation.mutate({
      entityType: form.entityType,
      entityId: `manual-${Date.now()}`,
      name: form.name.trim(),
      country: form.country,
    });
  };

  return (
    <div className="space-y-4">
      {/* Screen form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="w-4 h-4" />
            Run Adverse Media Screening
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Entity Type</Label>
              <Select value={form.entityType} onValueChange={(v: any) => setForm(f => ({ ...f, entityType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merchant">Merchant</SelectItem>
                  <SelectItem value="ubo">UBO</SelectItem>
                  <SelectItem value="director">Director</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Full Name</Label>
              <Input
                placeholder="Person or business name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Country</Label>
              <Select value={form.country} onValueChange={(v) => setForm(f => ({ ...f, country: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NG">Nigeria</SelectItem>
                  <SelectItem value="GH">Ghana</SelectItem>
                  <SelectItem value="KE">Kenya</SelectItem>
                  <SelectItem value="ZA">South Africa</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="mt-3"
            onClick={handleScreen}
            disabled={screenMutation.isPending}
          >
            {screenMutation.isPending ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Screening…</>
            ) : (
              <><Search className="w-3 h-3 mr-1" /> Run Screening</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Screening History</CardTitle>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>
          ) : !data?.screenings.length ? (
            <div className="text-sm text-muted-foreground text-center py-6">No screenings yet</div>
          ) : (
            <div className="space-y-2">
              {data.screenings.map((s) => (
                <div key={s.id} className="flex items-start justify-between p-3 rounded-lg border bg-card gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {s.flagged ? (
                      <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{s.query}</span>
                        <Badge variant={s.flagged ? "destructive" : "default"} className="text-xs shrink-0">
                          {s.flagged ? "Flagged" : "Clear"}
                        </Badge>
                        <Badge variant="outline" className="text-xs shrink-0 capitalize">{s.entityType}</Badge>
                      </div>
                      {s.flagReason && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.flagReason}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString()} · {s.provider}
                        {s.reviewedAt && ` · Reviewed ${new Date(s.reviewedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  {s.flagged && !s.reviewedAt && (
                    <Button
                      size="sm" variant="outline"
                      className="shrink-0 text-xs"
                      onClick={() => reviewMutation.mutate({ id: s.id, cleared: true })}
                      disabled={reviewMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground self-center">Page {page} of {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
