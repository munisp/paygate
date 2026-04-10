import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Link, Unlink, RefreshCw, Eye } from "lucide-react";

export default function OpenBankingV2() {
  const [activeTab, setActiveTab] = useState("consents");

  const mockConsents = [
    { id: "c1", bank: "Access Bank", scopes: ["accounts", "transactions"], status: "active", expires: "2026-12-31" },
    { id: "c2", bank: "GTBank", scopes: ["accounts"], status: "active", expires: "2026-10-15" },
    { id: "c3", bank: "Zenith Bank", scopes: ["accounts", "transactions", "payments"], status: "revoked", expires: "2025-06-01" },
  ];

  const mockAccounts = [
    { id: "acc1", bank: "Access Bank", accountNumber: "****4521", type: "Current", balance: 2450000, currency: "NGN" },
    { id: "acc2", bank: "GTBank", accountNumber: "****8834", type: "Savings", balance: 780000, currency: "NGN" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Open Banking V2</h1>
          <p className="text-muted-foreground">Aggregate accounts and access financial data across banks</p>
        </div>
        <Button>
          <Link className="w-4 h-4 mr-2" />
          Connect Bank Account
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-muted-foreground">Connected Banks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Link className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">2</p>
                <p className="text-sm text-muted-foreground">Active Consents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">₦3.23M</p>
                <p className="text-sm text-muted-foreground">Total Balance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="consents">Consents</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="consents">
          <Card>
            <CardHeader><CardTitle>Bank Consents</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockConsents.map(consent => (
                  <div key={consent.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{consent.bank}</p>
                        <p className="text-sm text-muted-foreground">Scopes: {consent.scopes.join(", ")} · Expires: {consent.expires}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={consent.status === "active" ? "default" : "secondary"}>{consent.status}</Badge>
                      {consent.status === "active" && (
                        <Button variant="ghost" size="sm"><Unlink className="w-4 h-4" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader><CardTitle>Aggregated Accounts</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{acc.bank} — {acc.type}</p>
                      <p className="text-sm text-muted-foreground">{acc.accountNumber}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-bold">₦{(acc.balance / 100).toLocaleString()}</p>
                      <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground py-8">Select an account to view transactions</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
