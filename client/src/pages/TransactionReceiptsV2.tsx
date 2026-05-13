import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, Send, RefreshCw, Search, Loader2 } from "lucide-react";

export default function TransactionReceiptsV2() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = trpc.txReceipts.list.useQuery({ page, search: search || undefined });

  const generate = trpc.txReceipts.generate.useMutation({
    onSuccess: () => { utils.txReceipts.list.invalidate(); toast({ title: "Receipt generated",
      onError: (e) => toast.error(e.message),
    }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resend = trpc.txReceipts.resend.useMutation({
    onSuccess: () => toast({ title: "Receipt resent",
      onError: (e) => toast.error(e.message),
    }),
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const receipts = data?.receipts ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> Transaction Receipts</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and resend transaction receipts</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Receipts</p><p className="text-2xl font-bold">{data?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Sent</p><p className="text-2xl font-bold text-green-600">{receipts.filter((r: any) => r.sentAt).length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-yellow-600">{receipts.filter((r: any) => !r.sentAt).length}</p></CardContent></Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by transaction ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div> :
        receipts.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No receipts found.</CardContent></Card> :
        <div className="space-y-2">
          {receipts.map((r: any) => (
            <Card key={r.id}><CardContent className="py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={r.sentAt ? "default" : "secondary"}>{r.sentAt ? "Sent" : "Pending"}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{r.transactionId?.slice(0, 16)}...</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ₦{Number(r.amount ?? 0).toLocaleString()} · {r.customerEmail ?? "No email"} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                {r.receiptUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5 mr-1" />Download</a>
                  </Button>
                )}
                {!r.receiptUrl && (
                  <Button size="sm" variant="outline" onClick={() => generate.mutate({ transactionId: r.transactionId })}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />Generate
                  </Button>
                )}
                <Button size="sm" onClick={() => resend.mutate({ id: r.id })}>
                  <Send className="w-3.5 h-3.5 mr-1" />Resend
                </Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      }

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
