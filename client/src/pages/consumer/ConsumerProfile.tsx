/**
 * Consumer Profile Page
 * Shows user info, allows profile editing, links to all account features, security settings.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BiometricAuth } from "@/components/BiometricAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Shield, Bell, HelpCircle, LogOut, ChevronRight,
  CreditCard, Users, RefreshCw, Star, Lock, BadgeCheck,
  Edit2, Check, X,
} from "lucide-react";

function NotificationsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Notifications</DialogTitle></DialogHeader>
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          No new notifications. You will be notified here for transfers, top-ups, and security alerts.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SecurityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Security &amp; Privacy</DialogTitle></DialogHeader>
        <div className="py-4 space-y-3 text-sm">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="font-medium">Two-Factor Authentication</span>
            <Badge variant="outline" className="text-emerald-600 border-emerald-200">Enabled</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="font-medium">Session Timeout</span>
            <span className="text-muted-foreground">30 minutes</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="font-medium">Login Alerts</span>
            <Badge variant="outline" className="text-emerald-600 border-emerald-200">Active</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <span className="font-medium">Biometric Login</span>
            <Badge variant="outline" className="text-blue-600 border-blue-200">Registered below</Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Help &amp; Support</DialogTitle></DialogHeader>
        <div className="py-4 space-y-3 text-sm">
          <a
            href="mailto:support@paygate.africa"
            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <HelpCircle className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium">Email Support</p>
              <p className="text-xs text-muted-foreground">support@paygate.africa</p>
            </div>
          </a>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium">Live Chat</p>
              <p className="text-xs text-muted-foreground">Available 9am – 6pm WAT</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <Bell className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium">Status Page</p>
              <p className="text-xs text-muted-foreground">status.paygate.africa</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ConsumerProfile() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [emailValue, setEmailValue] = useState(user?.email ?? "");

  const utils = trpc.useUtils();
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.auth.me.invalidate();
      setEditingName(false);
      setEditingEmail(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto pt-4 pb-8">
      {/* Profile Header */}
      <div className="flex flex-col items-center gap-3 py-4">
        <Avatar className="w-20 h-20">
          <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="text-center w-full space-y-2">
          {/* Editable Name */}
          {editingName ? (
            <div className="flex items-center gap-2 justify-center">
              <input
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                className="text-xl font-bold text-center border-b border-primary bg-transparent focus:outline-none w-48"
                autoFocus
              />
              <button
                onClick={() => updateProfile.mutate({ name: nameValue })}
                disabled={updateProfile.isPending}
                className="p-1 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setEditingName(false); setNameValue(user?.name ?? ""); }}
                className="p-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center">
              <h2 className="text-xl font-bold">{user?.name || "User"}</h2>
              <button
                onClick={() => { setEditingName(true); setNameValue(user?.name ?? ""); }}
                className="p-1 rounded-full hover:bg-muted transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Editable Email */}
          {editingEmail ? (
            <div className="flex items-center gap-2 justify-center">
              <input
                value={emailValue}
                onChange={e => setEmailValue(e.target.value)}
                className="text-sm text-center border-b border-primary bg-transparent focus:outline-none w-52"
                autoFocus
              />
              <button
                onClick={() => updateProfile.mutate({ email: emailValue })}
                disabled={updateProfile.isPending}
                className="p-1 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setEditingEmail(false); setEmailValue(user?.email ?? ""); }}
                className="p-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center">
              <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
              <button
                onClick={() => { setEditingEmail(true); setEmailValue(user?.email ?? ""); }}
                className="p-1 rounded-full hover:bg-muted transition-colors"
              >
                <Edit2 className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}
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

      {/* Account Features */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Account Features</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border">
          {[
            { icon: CreditCard, label: "Virtual Card",      sub: "Online payments & e-commerce",  path: "/consumer/card" },
            { icon: Users,      label: "Contacts",           sub: "Saved recipients & friends",    path: "/consumer/contacts" },
            { icon: RefreshCw,  label: "Recurring Payments", sub: "Scheduled standing orders",     path: "/consumer/recurring" },
            { icon: Star,       label: "Loyalty Points",     sub: "Earn & redeem rewards",         path: "/consumer/loyalty" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="flex items-center justify-between w-full py-3 hover:text-primary transition-colors"
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Security</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border">
          {[
            { icon: Lock,       label: "Set / Change PIN",  sub: "Secure your transactions",       path: "/consumer/pin" },
            { icon: BadgeCheck, label: "Verify Identity",   sub: "KYC — unlock higher limits",     path: "/consumer/kyc" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="flex items-center justify-between w-full py-3 hover:text-primary transition-colors"
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Settings Menu */}
      <Card>
        <CardContent className="pt-4 divide-y divide-border">
          {[
            { icon: Bell,       label: "Notifications",     action: () => setNotifOpen(true) },
            { icon: Shield,     label: "Security & Privacy",action: () => setSecurityOpen(true) },
            { icon: HelpCircle, label: "Help & Support",    action: () => setSupportOpen(true) },
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

      <NotificationsDialog open={notifOpen} onClose={() => setNotifOpen(false)} />
      <SecurityDialog open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
