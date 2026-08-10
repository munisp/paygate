import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Gift, Copy, Share2, Users, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  qualified: "bg-blue-100 text-blue-700",
  rewarded: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-500",
};

export default function ConsumerReferrals() {
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data: myCode, isLoading: codeLoading, isError } = trpc.wave24.referrals.getMyCode.useQuery();
  const { data: stats } = trpc.wave24.referrals.getStats.useQuery();
  const { data: history } = trpc.wave24.referrals.list.useQuery({ limit, offset: page * limit }, { staleTime: 30_000 });

  const referralLink = myCode ? `${window.location.origin}/signup?ref=${myCode.referralCode}` : "";

  const copyCode = () => {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode.referralCode);
    toast.success("Referral code copied!");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Join PayGate",
        text: "Use my referral code to sign up on PayGate and get a bonus!",
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const totalEarned = parseInt(stats?.total_earned_kobo as string ?? "0");
  const totalReferrals = parseInt(stats?.total_referrals as string ?? "0");
  const qualified = parseInt(stats?.qualified as string ?? "0");
  const rewarded = parseInt(stats?.rewarded as string ?? "0");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Gift className="w-5 h-5" />Referral Program</h2>
        <p className="text-muted-foreground text-sm">Invite friends and earn rewards when they sign up</p>
      </div>

      {/* Referral Code Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6 pb-6">
          <div className="text-center space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Your Referral Code</div>
            {codeLoading ? (
              <div className="h-12 bg-muted/30 rounded-lg animate-pulse" />
            ) : (
              <div className="text-4xl font-bold font-mono tracking-widest text-primary">
                {myCode?.referralCode ?? "—"}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" aria-label="Copy" onClick={copyCode}><Copy/>Copy Code
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy" onClick={copyLink}><Copy/>Copy Link
              </Button>
              <Button size="sm" onClick={shareLink}>
                <Share2 className="w-4 h-4 mr-2" />Share
              </Button>
            </div>
            {myCode?.expiresAt && (
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Valid until {format(new Date(myCode.expiresAt), "MMM d, yyyy")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{totalReferrals}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />Total Referrals
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{qualified}</div>
            <div className="text-xs text-muted-foreground">Qualified</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{rewarded}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />Rewarded
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">₦{(totalEarned / 100).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Earned</div>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { step: "1", title: "Share Your Code", desc: "Share your unique referral code or link with friends" },
              { step: "2", title: "Friend Signs Up", desc: "Your friend creates an account using your code" },
              { step: "3", title: "Both Earn Rewards", desc: "You both receive ₦500 bonus when they complete their first transaction" },
            ].map(s => (
              <div key={s.step} className="text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold mx-auto">
                  {s.step}
                </div>
                <div className="font-medium text-sm">{s.title}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!history || history.items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No referrals yet. Share your code to get started!
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Referred User</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Your Reward</th>
                  <th className="text-left p-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map(ref => (
                  <tr key={ref.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 text-xs font-mono">
                      {ref.refereeId ? `User #${ref.refereeId}` : "Pending signup"}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ref.status] ?? ""}`}>
                        {ref.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {ref.referrerPaid
                        ? <span className="text-green-600 font-medium">₦{((ref.referrerRewardKobo ?? 0) / 100).toLocaleString()}</span>
                        : <span className="text-muted-foreground">Pending</span>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {format(new Date(ref.createdAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
