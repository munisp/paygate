import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, TrendingUp, AlertCircle, BarChart2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminHelpAnalytics() {
  const [userType, setUserType] = useState<"all" | "merchant" | "consumer" | "admin">("all");
  const [days, setDays] = useState(30);

  const { data: topQueries, isLoading, isError: topLoading } = trpc.wave24.helpAnalytics.getTopQueries.useQuery({
    userType,
    days,
    limit: 20,
  }, { staleTime: 30_000 });

  const { data: unanswered, isLoading: isLoadingUnanswered, isError: unansweredLoading } = trpc.wave24.helpAnalytics.getUnansweredQueries.useQuery({
    days,
    limit: 20,
  }, { staleTime: 30_000 });

  const maxCount = Math.max(...(topQueries ?? []).map(q => parseInt(q.search_count as unknown as string)));

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 className="w-6 h-6" />Help Search Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Understand what users are searching for in the help center</p>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={userType} onValueChange={(v) => setUserType(v as typeof userType)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="merchant">Merchants</SelectItem>
              <SelectItem value="consumer">Consumers</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Top Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />Top Search Queries
              </CardTitle>
              <CardDescription>Most searched terms in the help center</CardDescription>
            </CardHeader>
            <CardContent>
              {topLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading...</div>
              ) : !topQueries || topQueries.length === 0 ? (
                <div className="text-center text-muted-foreground py-6">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No search data yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topQueries.map((q, i) => {
                    const count = parseInt(q.search_count as unknown as string);
                    const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    const clickRate = count > 0
                      ? Math.round((parseInt(q.click_count as unknown as string) / count) * 100)
                      : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate max-w-[60%]">{q.query}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{count} searches</Badge>
                            <span className="text-xs text-muted-foreground">{clickRate}% CTR</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Avg results: {parseFloat(q.avg_results as unknown as string).toFixed(1)}</span>
                          <span>•</span>
                          <span className="capitalize">{q.user_type}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unanswered Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500" />Unanswered Queries
              </CardTitle>
              <CardDescription>Searches that returned 0 results — documentation gaps</CardDescription>
            </CardHeader>
            <CardContent>
              {unansweredLoading ? (
                <div className="text-center text-muted-foreground py-6">Loading...</div>
              ) : !unanswered || unanswered.length === 0 ? (
                <div className="text-center text-muted-foreground py-6">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No unanswered queries — great coverage!
                </div>
              ) : (
                <div className="space-y-2">
                  {unanswered.map((q, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 border border-orange-100">
                      <span className="text-sm font-medium">{q.query}</span>
                      <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
                        {parseInt(q.search_count as unknown as string)}x
                      </Badge>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-3">
                    These queries had no results. Consider adding documentation for these topics.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
