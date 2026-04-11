import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  topup: "#22c55e",
  p2p_send: "#f97316",
  p2p_receive: "#3b82f6",
  qr_pay: "#a855f7",
  bill_pay: "#ef4444",
  red_envelope_send: "#ec4899",
  red_envelope_receive: "#14b8a6",
  debit: "#f59e0b",
  refund: "#6366f1",
};

const CATEGORY_LABELS: Record<string, string> = {
  topup: "Top-Up",
  p2p_send: "P2P Sent",
  p2p_receive: "P2P Received",
  qr_pay: "QR Pay",
  bill_pay: "Bill Pay",
  red_envelope_send: "Red Envelope Sent",
  red_envelope_receive: "Red Envelope Received",
  debit: "Debit",
  refund: "Refund",
};

function fmt(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsumerAnalytics() {
  const { data: monthly, isLoading: loadingMonthly } = trpc.consumerAnalytics.spendByMonth.useQuery({ months: 6 });
  const { data: categories, isLoading: loadingCat } = trpc.consumerAnalytics.spendByCategory.useQuery();
  const { data: split, isLoading: loadingSplit } = trpc.consumerAnalytics.creditDebitSplit.useQuery();
  const { data: daily, isLoading: loadingDaily } = trpc.consumerAnalytics.dailyUsage.useQuery({ days: 7 });
  const { data: topCounterparties } = trpc.consumerAnalytics.topCounterparties.useQuery({ limit: 5 });

  const totalCredit = split?.creditKobo ?? 0;
  const totalDebit = split?.debitKobo ?? 0;
  const netFlow = totalCredit - totalDebit;

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Spending Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Your financial activity at a glance</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <ArrowDownLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Money In (30d)</span>
            </div>
            {loadingSplit ? <Skeleton className="h-6 w-24" /> : (
              <p className="text-lg font-bold">{fmt(totalCredit)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <ArrowUpRight className="w-4 h-4" />
              <span className="text-xs font-medium">Money Out (30d)</span>
            </div>
            {loadingSplit ? <Skeleton className="h-6 w-24" /> : (
              <p className="text-lg font-bold">{fmt(totalDebit)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Wallet className="w-4 h-4" />
              <span className="text-xs font-medium">Net Flow (30d)</span>
            </div>
            {loadingSplit ? <Skeleton className="h-6 w-24" /> : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">{fmt(Math.abs(netFlow))}</p>
                {netFlow >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Activity (6 months)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(monthly ?? []).map(r => ({
                month: r.month,
                "Money In": Number(r.totalCredit) / 100,
                "Money Out": Number(r.totalDebit) / 100,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                <Bar dataKey="Money In" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Money Out" fill="#f97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Category pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend by Category (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCat ? <Skeleton className="h-40 w-full" /> : (
              <div className="flex flex-col gap-2">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={(categories ?? []).map(c => ({
                        name: CATEGORY_LABELS[c.category] ?? c.category,
                        value: Number(c.totalKobo) / 100,
                        fill: CATEGORY_COLORS[c.category] ?? "#94a3b8",
                      }))}
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={70}
                      dataKey="value"
                    >
                      {(categories ?? []).map((c: any) => (
                        <Cell key={c.category} fill={CATEGORY_COLORS[c.category] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-1">
                  {(categories ?? []).slice(0, 5).map(c => (
                    <Badge key={c.category} variant="secondary" className="text-xs gap-1">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ background: CATEGORY_COLORS[c.category] ?? "#94a3b8" }}
                      />
                      {CATEGORY_LABELS[c.category] ?? c.category}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily usage line chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Activity (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDaily ? <Skeleton className="h-40 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={(daily ?? []).map(r => ({
                  day: r.day.slice(5), // MM-DD
                  Amount: Number(r.totalKobo) / 100,
                  Txns: Number(r.txCount),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="Amount" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top counterparties */}
      {topCounterparties && topCounterparties.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Payees (3 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topCounterparties.map((cp, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {(cp.counterpartyName ?? "?")[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{cp.counterpartyName ?? "Unknown"}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(Number(cp.totalKobo))}</p>
                    <p className="text-xs text-muted-foreground">{cp.txCount} txns</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
