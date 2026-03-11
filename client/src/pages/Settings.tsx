import { useState } from "react";
import { Building2, Users, Shield, Bell, CreditCard, Globe, Save, Plus, Trash2, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const TEAM = [
  { id: 1, name: "Chidi Eze", email: "chidi@acmecorp.com", role: "Owner", status: "active", lastLogin: "2 min ago" },
  { id: 2, name: "Adaeze Okonkwo", email: "adaeze@acmecorp.com", role: "Admin", status: "active", lastLogin: "1 hr ago" },
  { id: 3, name: "Emeka Obi", email: "emeka@acmecorp.com", role: "Developer", status: "active", lastLogin: "3 hrs ago" },
  { id: 4, name: "Fatima Al-Rashid", email: "fatima@acmecorp.com", role: "Finance", status: "active", lastLogin: "Yesterday" },
  { id: 5, name: "Kwame Asante", email: "kwame@acmecorp.com", role: "Support", status: "invited", lastLogin: "Never" },
];

const TABS = [
  { id: "business", label: "Business Profile", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "billing", label: "Billing", icon: CreditCard },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("business");
  const [business, setBusiness] = useState({
    name: "Acme Corp",
    email: "payments@acmecorp.com",
    phone: "+234 801 234 5678",
    website: "https://acmecorp.com",
    address: "14 Broad Street, Lagos Island, Lagos",
    country: "Nigeria",
    industry: "E-commerce",
    description: "Leading e-commerce platform in West Africa",
  });
  const [notifications, setNotifications] = useState({
    successEmail: true, failureEmail: true, successSms: false, failureSms: true,
    weeklyReport: true, monthlyReport: true, securityAlerts: true, productUpdates: false,
  });

  const handleSaveBusiness = () => toast.success("Business profile updated successfully");

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "business" && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-5">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Business Profile</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Business Name", key: "name", icon: Building2 },
                  { label: "Business Email", key: "email", icon: Mail },
                  { label: "Phone Number", key: "phone", icon: Phone },
                  { label: "Website", key: "website", icon: Globe },
                  { label: "Country", key: "country", icon: MapPin },
                  { label: "Industry", key: "industry", icon: Building2 },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium text-foreground">{field.label}</label>
                    <div className="relative mt-1">
                      <field.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={(business as any)[field.key]}
                        onChange={(e) => setBusiness((p) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                ))}
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Business Address</label>
                  <input value={business.address} onChange={(e) => setBusiness((p) => ({ ...p, address: e.target.value }))} className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Business Description</label>
                  <textarea value={business.description} onChange={(e) => setBusiness((p) => ({ ...p, description: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>
              <Button onClick={handleSaveBusiness}><Save className="w-4 h-4 mr-2" />Save Changes</Button>
            </div>
          )}

          {activeTab === "team" && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Team Members</h3>
                  <Button size="sm" onClick={() => toast.success("Invitation sent!")}><Plus className="w-4 h-4 mr-2" />Invite Member</Button>
                </div>
                <div className="space-y-3">
                  {TEAM.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">{member.name.split(" ").map((n) => n[0]).join("")}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email} · Last login: {member.lastLogin}</p>
                      </div>
                      <Badge variant="secondary" className={`text-xs ${member.role === "Owner" ? "bg-amber-50 text-amber-700 border border-amber-200" : member.role === "Admin" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-muted text-muted-foreground"}`}>{member.role}</Badge>
                      <Badge className={`text-xs ${member.status === "active" ? "status-success border-0" : "bg-muted text-muted-foreground border-0"}`}>{member.status}</Badge>
                      {member.role !== "Owner" && (
                        <button onClick={() => toast.error(`${member.name} removed`)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Security Settings</h3>
                {[
                  { label: "Two-Factor Authentication", desc: "Require 2FA for all admin logins", enabled: true },
                  { label: "IP Allowlisting", desc: "Restrict API access to specific IP addresses", enabled: false },
                  { label: "Session Timeout", desc: "Automatically log out after 30 minutes of inactivity", enabled: true },
                  { label: "Audit Logging", desc: "Log all account activity for compliance", enabled: true },
                ].map((setting) => (
                  <div key={setting.label} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{setting.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{setting.desc}</p>
                    </div>
                    <button
                      onClick={() => toast.success(`${setting.label} ${setting.enabled ? "disabled" : "enabled"}`)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${setting.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${setting.enabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                ))}
                <Button variant="outline" onClick={() => toast.success("Password reset email sent")}>Change Password</Button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Notification Preferences</h3>
              {Object.entries(notifications).map(([key, val]) => {
                const labels: Record<string, { label: string; desc: string }> = {
                  successEmail: { label: "Successful Payment (Email)", desc: "Get notified for every successful transaction" },
                  failureEmail: { label: "Failed Payment (Email)", desc: "Get notified when a payment fails" },
                  successSms: { label: "Successful Payment (SMS)", desc: "SMS alert for successful transactions" },
                  failureSms: { label: "Failed Payment (SMS)", desc: "SMS alert for failed transactions" },
                  weeklyReport: { label: "Weekly Report", desc: "Weekly summary of your payment activity" },
                  monthlyReport: { label: "Monthly Report", desc: "Monthly analytics and reconciliation report" },
                  securityAlerts: { label: "Security Alerts", desc: "Alerts for suspicious activity or login attempts" },
                  productUpdates: { label: "Product Updates", desc: "News about new features and improvements" },
                };
                const info = labels[key];
                return (
                  <div key={key} className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{info.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.desc}</p>
                    </div>
                    <button
                      onClick={() => { setNotifications((p) => ({ ...p, [key]: !p[key as keyof typeof p] })); toast.success("Preference updated"); }}
                      className={`relative w-11 h-6 rounded-full transition-colors ${val ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                );
              })}
              <Button onClick={() => toast.success("Notification preferences saved")}><Save className="w-4 h-4 mr-2" />Save Preferences</Button>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Current Plan</h3>
                <div className="flex items-center justify-between p-5 rounded-xl bg-primary/5 border border-primary/20">
                  <div>
                    <p className="font-semibold text-primary text-lg">Enterprise Plan</p>
                    <p className="text-sm text-muted-foreground mt-1">1.2% per transaction · Unlimited volume · Priority support</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold amount" style={{ fontFamily: "Space Grotesk, sans-serif" }}>1.2%</p>
                    <p className="text-xs text-muted-foreground">per transaction</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {[{ label: "This Month", value: "₦11.2M" }, { label: "Fees Paid", value: "₦134,400" }, { label: "Next Invoice", value: "Apr 1, 2026" }].map((s) => (
                    <div key={s.label} className="text-center p-4 rounded-xl bg-muted/50">
                      <p className="font-bold amount" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
