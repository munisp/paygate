/**
 * Coupons / Vouchers (Consumer) - Wave 68
 * Validate a coupon code, see the discount, and view redemption history.
 */
import { useState, useMemo } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Tag, Ticket, CheckCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function Coupons() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [queryInput, setQueryInput] = useState<{ code: string; amountKobo: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: redemptionsData, isLoading } = trpc.coupons.myRedemptions.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const redemptions = redemptionsData ?? [];

  const stableInput = useMemo(() => queryInput ?? skipToken, [queryInput]);
  const { data: validated, isFetching: validating } = trpc.coupons.validate.useQuery(
    stableInput as any,
    { enabled: !!queryInput, retry: false, staleTime: 0 }
  );

  const redeem = trpc.coupons.redeem.useMutation({
    onSuccess: () => {
      toast.success("Coupon applied!");
      setQueryInput(null);
      setCode("");
      setAmount("");
      utils.coupons.myRedemptions.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleValidate = () => {
    if (!code) { toast.error("Enter a coupon code"); return; }
    if (!amount || parseFloat(amount) < 1) { toast.error("Enter the order amount to check discount"); return; }
    setQueryInput({ code, amountKobo: Math.round(parseFloat(amount) * 100) });
  };

  if (!isLoading && !redemptionsData) {
    return (
      <div className="p-6">
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">Coupons &amp; Vouchers</h1>
      </div>

      <Tabs defaultValue="check">
        <TabsList className="w-full">
          <TabsTrigger value="check" className="flex-1">Check Code</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="check" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Coupon Code</Label>
                <Input placeholder="e.g. SAVE20" value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setQueryInput(null); }}
                  className="font-mono text-lg tracking-widest" />
              </div>
              <div className="space-y-1.5">
                <Label>Order Amount (NGN)</Label>
                <Input type="number" placeholder="e.g. 5000" min={1} value={amount}
                  onChange={e => { setAmount(e.target.value); setQueryInput(null); }} />
              </div>
              <Button className="w-full" onClick={handleValidate} disabled={!code || !amount || validating}>
                {validating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Tag className="w-4 h-4 mr-2" />}
                Check Coupon
              </Button>
            </CardContent>
          </Card>

          {validated && !validating && (
            <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300">Valid Coupon!</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order Amount</span>
                        <span>&#8358;{parseFloat(amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Discount ({validated.code})</span>
                        <span>- &#8358;{(validated.discountKobo / 100).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>You Pay</span>
                        <span>&#8358;{(validated.finalAmountKobo / 100).toLocaleString()}</span>
                      </div>
                    </div>
                    <Button className="w-full mt-3" size="sm"
                      onClick={() => redeem.mutate({ couponId: validated.couponId, amountKobo: Math.round(parseFloat(amount) * 100) })}
                      disabled={redeem.isPending}>
                      {redeem.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Apply Coupon
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !(redemptions as any[]).length ? (
            <div className="text-center py-10 text-muted-foreground">
              <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No coupons used yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(redemptions as any[]).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <Tag className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-mono font-medium">{r.couponCode ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-500">- &#8358;{(r.amountSavedKobo / 100).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
