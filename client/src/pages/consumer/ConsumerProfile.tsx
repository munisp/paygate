/**
 * Consumer Profile Page
 * Shows user info, security settings, biometric auth registration.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BiometricAuth } from "@/components/BiometricAuth";
import { toast } from "sonner";
import { Shield, Bell, HelpCircle, LogOut, ChevronRight, User } from "lucide-react";

export default function ConsumerProfile() {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto pt-8">
      {/* Profile Header */}
      <div className="flex flex-col items-center gap-3 py-4">
        <Avatar className="w-20 h-20">
          <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h2 className="text-xl font-bold">{user?.name || "User"}</h2>
          <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
        </div>
        <Badge variant="outline" className="text-xs">Verified Account</Badge>
      </div>

      {/* Biometric Auth */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />Biometric Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BiometricAuth
            username={user?.name || "user"}
            mode="register"
            onSuccess={() => toast.success("Biometric registered — you can now use Face ID / Touch ID to sign in")}
            onError={(e) => toast.error(e)}
          />
        </CardContent>
      </Card>

      {/* Settings Menu */}
      <Card>
        <CardContent className="pt-4 divide-y divide-border">
          {[
            { icon: Bell, label: "Notifications", action: () => toast.info("Notifications coming soon") },
            { icon: Shield, label: "Security & Privacy", action: () => toast.info("Security settings coming soon") },
            { icon: HelpCircle, label: "Help & Support", action: () => toast.info("Support coming soon") },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="flex items-center justify-between w-full py-3 hover:text-primary transition-colors"
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      <Separator />

      <Button
        variant="outline"
        className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
        onClick={() => logout()}
      >
        <LogOut className="w-4 h-4" />Sign Out
      </Button>
    </div>
  );
}
