import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function NodalAccounts() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<"escrow" | "marketplace" | "collections" | "payroll" | "insurance">("escrow");
  const [bankCode, setBankCode] = useState("044");
  const [description, setDescription] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [destAccount, setDestAccount] = useState("");
  const [destBank, setDestBank] = useState("044");
  const [narration, setNarration] = useState("");

  const {isLoading, data: accounts, refetch} = trpc.newFeatures.nodalAccounts.listNodalAccounts.useQuery();
  const { data: txHistory } = trpc.newFeatures.nodalAccounts.getNodalTransactions.useQuery(
    { accountId: selectedAccount ?? "" },
    { enabled: !!selectedAccount , staleTime: 30_000 })

  const createMutation = trpc.newFeatures.nodalAccounts.createNodalAccount.useMutation({
    onSuccess: (d: any) => { toast.success(`Nodal account ${d.accountNumber} created`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const transferMutation = trpc.newFeatures.nodalAccounts.transferFromNodal.useMutation({
    onSuccess: (d: any) => toast.success(`Transfer ${d.reference} initiated`),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const purposeColors: Record<string, string> = { escrow: "bg-blue-100 text-blue-700", marketplace: "bg-purple-100 text-purple-700", collections: "bg-green-100 text-green-700", payroll: "bg-orange-100 text-orange-700", insurance: "bg-cyan-100 text-cyan-700" };

  const banks = [
    { code: "044", name: "Access Bank" }, { code: "058", name: "GTBank" }, { code: "057", name: "Zenith Bank" },
    { code: "033", name: "UBA" }, { code: "011", name: "First Bank" }, { code: "032", name: "Union Bank" },
  ];

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Nodal Accounts</h1>

      {/* Accounts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts?.accounts?.map(acc => (
          <Card key={acc.accountId}
            className={`cursor-pointer transition-all ${selectedAccount === acc.accountId ? "ring-2 ring-primary" : "hover:border-primary"}`}
            onClick={() => setSelectedAccount(acc.accountId)}>
            <CardContent className="pt-4">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${purposeColors[acc.purpose] ?? "bg-gray-100 text-gray-700"}`}>{acc.purpose}</span>
                <Badge variant={acc.status === "active" ? "default" : "secondary"}>{acc.status}</Badge>
              </div>
              <p className="font-mono font-bold text-lg">{acc.accountNumber}</p>
              <p className="text-sm text-muted-foreground">{acc.bankName}</p>
              <p className="text-xl font-bold mt-2">{formatKobo(acc.balanceKobo)}</p>
              <p className="text-xs text-muted-foreground">{new Date(acc.createdAt).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}

        {/* Create New */}
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <p className="font-medium text-sm">Create Nodal Account</p>
            <div>
              <label className="text-xs text-muted-foreground">Purpose</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={purpose} onChange={e => setPurpose(e.target.value as typeof purpose)}>
                <option value="escrow">Escrow</option>
                <option value="marketplace">Marketplace</option>
                <option value="collections">Collections</option>
                <option value="payroll">Payroll</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bank</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={bankCode} onChange={e => setBankCode(e.target.value)}>
                {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground">Description</label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Marketplace escrow" /></div>
            <Button size="sm" className="w-full" disabled={createMutation.isPending}
              onClick={() => createMutation.mutate({ purpose, bankCode, description })}>
              {createMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Transfer from Nodal */}
      {selectedAccount && (
        <Card>
          <CardHeader><CardTitle>Transfer from Nodal Account</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label className="text-xs text-muted-foreground">Amount (₦)</label><Input value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="10000" /></div>
              <div><label className="text-xs text-muted-foreground">Destination Account</label><Input value={destAccount} onChange={e => setDestAccount(e.target.value)} placeholder="0123456789" /></div>
              <div>
                <label className="text-xs text-muted-foreground">Destination Bank</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={destBank} onChange={e => setDestBank(e.target.value)}>
                  {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Narration</label><Input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Payment for..." /></div>
            </div>
            <Button disabled={transferMutation.isPending}
              onClick={() => transferMutation.mutate({ accountId: selectedAccount, amountKobo: Math.round(parseFloat(transferAmount) * 100), destinationAccountNumber: destAccount, destinationBankCode: destBank, narration })}>
              {transferMutation.isPending ? "Transferring..." : "Initiate Transfer"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      {selectedAccount && txHistory && (
        <Card>
          <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
          <CardContent>
            {!txHistory.transactions?.length ? <p className="text-muted-foreground text-sm">No transactions yet</p> :
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2">Narration</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Balance</th><th className="text-right py-2">Date</th></tr></thead>
                <tbody>
                  {txHistory.transactions.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="py-2">
                        <p>{t.narration}</p>
                        <p className="text-xs text-muted-foreground capitalize">{t.type}</p>
                      </td>
                      <td className={`text-right font-semibold ${t.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                        {t.type === "credit" ? "+" : "-"}{formatKobo(t.amountKobo)}
                      </td>
                      <td className="text-right">{formatKobo(t.balance)}</td>
                      <td className="text-right text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            }
          </CardContent>
        </Card>
      )}
    </div>
  );
}
