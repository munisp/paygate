import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Link, RefreshCw, Unlink, Plus } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

export default function OpenBankingV2() {
  const [activeTab, setActiveTab] = useState("consents");
  const [connectOpen, setConnectOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");

  const { data: consentsData, isLoading: loadingConsents, refetch: refetchConsents } = trpc5.openBankingV2.listConsents.useQuery();
  const { data: accountsData, isLoading: loadingAccounts } = trpc5.openBankingV2.listAccounts.useQuery();

  const createConsent = trpc5.openBankingV2.createConsent.useMutation({
    onSuccess: () => { toast.success("Bank consent created"); setConnectOpen(false); setBankCode(""); setBankName(""); refetchConsents(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const revokeConsent = trpc5.openBankingV2.revokeConsent.useMutation({
    onSuccess: () => { toast.success("Consent revoked"); refetchConsents(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const syncAccounts = trpc5.openBankingV2.syncAccounts.useMutation({
    onSuccess: () => toast.success("Accounts synced"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const consents = consentsData?.consents ?? [];
  const accounts = accountsData?.accounts ?? [];
  const activeConsents = consents.filter(c => c.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Open Banking V2</h1>
          <p className="text-muted-foreground">Aggregate accounts and access financial data across banks</p>
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          <Link className="w-4 h-4 mr-2" />Connect Bank Account
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Building2 className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{consents.length}</p><p className="text-sm text-muted-foreground">Connected Banks</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Link className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{activeConsents}</p><p className="text-sm text-muted-foreground">Active Consents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><RefreshCw className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{accounts.length}</p><p className="text-sm text-muted-foreground">Linked Accounts</p></div></div></CardContent></Card>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="consents">Consents</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="consents">
          <Card><CardHeader><CardTitle>Bank Consents</CardTitle></CardHeader><CardContent>
            {loadingConsents ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            consents.length === 0 ? (
              <div className="text-center py-8"><Building2 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" /><p className="text-muted-foreground">No bank consents yet. Connect a bank to get started.</p></div>
            ) : (
              <div className="space-y-3">{consents.map(consent => (
                <div key={consent.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{consent.bankName}</p>
                      <p className="text-sm text-muted-foreground">Scopes: {consent.scopes} · Expires: {consent.expiresAt ? new Date(consent.expiresAt).toLocaleDateString() : "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={consent.status === "active" ? "default" : "secondary"}>{consent.status}</Badge>
                    {consent.status === "active" && <Button variant="ghost" size="sm" onClick={() => revokeConsent.mutate({ consentId: consent.id })}><Unlink className="w-4 h-4" /></Button>}
                    {consent.status === "pending" && <Button size="sm" variant="outline" onClick={() => syncAccounts.mutate({ consentId: consent.id })}><RefreshCw className="w-4 h-4 mr-1" />Sync</Button>}
                  </div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="accounts">
          <Card><CardHeader><CardTitle>Aggregated Accounts</CardTitle></CardHeader><CardContent>
            {loadingAccounts ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
            accounts.length === 0 ? (
              <div className="text-center py-8"><p className="text-muted-foreground">No accounts linked yet. Create a consent and sync to see accounts.</p></div>
            ) : (
              <div className="space-y-3">{accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div><p className="font-medium">{acc.bankCode} — {acc.accountType}</p><p className="text-sm text-muted-foreground">{acc.accountNumber}</p></div>
                  <div className="flex items-center gap-3"><p className="font-bold">{acc.currency} {(acc.balance / 100).toLocaleString()}</p><Badge variant="outline">{acc.accountType}</Badge></div>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Bank Code</Label><Input placeholder="e.g. 044" value={bankCode} onChange={e => setBankCode(e.target.value)} /></div>
            <div className="space-y-2"><Label>Bank Name</Label><Input placeholder="e.g. Access Bank" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button onClick={() => createConsent.mutate({ bankCode, bankName })} disabled={!bankCode || !bankName || createConsent.isPending}><Plus className="w-4 h-4 mr-2" />{createConsent.isPending ? "Connecting..." : "Connect"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
