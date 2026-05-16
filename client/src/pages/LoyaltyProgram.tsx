import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Gift, TrendingUp, Users, RefreshCw, Award } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-blue-100 text-blue-800",
};

export default function LoyaltyProgram() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: account, isLoading: accountLoading } = trpc.loyalty.getAccount.useQuery();
  const { data: history, isLoading: histLoading, isError, refetch } = trpc.loyalty.history.useQuery({
    limit,
    offset: page * limit,
  }, { staleTime: 30_000 });

  const formatPoints = (p: number) => p.toLocaleString();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loyalty Program</h1>
          <p className="text-muted-foreground text-sm mt-1">Points balance, tier status, and transaction history</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Account Summary */}
      {accountLoading ? (
        <div className="text-muted-foreground text-sm">Loading account…</div>
      ) : account ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1 border-2 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Current Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Award className="w-10 h-10 text-primary" />
                <div>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${TIER_COLORS[account.tier ?? "bronze"] ?? "bg-gray-100 text-gray-600"}`}>
                    {account.tier ?? "Bronze"}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Member since {new Date(account.createdAt ?? Date.now()).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Current Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Star className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="text-3xl font-bold">{formatPoints(account.pointsBalance ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">points available</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Lifetime Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-3xl font-bold">{formatPoints(account.lifetimePoints ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">total earned</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No loyalty account found. Transactions will auto-create one.
          </CardContent>
        </Card>
      )}

      {/* Tier Progress */}
      {account && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tier Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {["bronze", "silver", "gold", "platinum"].map((tier, i) => (
                <div key={tier} className="flex items-center gap-2 flex-1">
                  <div className={`flex-1 h-2 rounded-full ${
                    ["bronze", "silver", "gold", "platinum"].indexOf(account.tier ?? "bronze") >= i
                      ? "bg-primary"
                      : "bg-muted"
                  }`} />
                  <span className={`text-xs font-medium capitalize ${
                    account.tier === tier ? "text-primary" : "text-muted-foreground"
                  }`}>{tier}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Bronze: 0–999 pts · Silver: 1,000–4,999 pts · Gold: 5,000–19,999 pts · Platinum: 20,000+ pts
            </p>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Points History</h2>
        <Card>
          <CardContent className="p-0">
            {isError ? (
              <div className="p-8 text-center text-destructive">Failed to load history.</div>
            ) : histLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No history yet</TableCell>
                    </TableRow>
                  )}
                  {history?.rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge className={r.txnType === "earn" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                          {r.txnType}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-bold ${r.txnType === "earn" ? "text-green-600" : "text-red-600"}`}>
                        {r.txnType === "earn" ? "+" : "-"}{formatPoints(r.points)}
                      </TableCell>
                      <TableCell className="text-sm">{r.description ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.referenceId ?? "—"}</TableCell>
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
      </div>

      {/* Pagination */}
      {history && history.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(history.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= history.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
