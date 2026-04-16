/**
 * Notification Preferences Screen
 *
 * Allows merchants to toggle which event types and channels trigger notifications.
 * Settings are stored per-merchant in the `realtime_notification_preferences` table
 * and synced via the `notificationPreferences.update` tRPC procedure.
 *
 * Sections:
 *  1. Delivery Channels  — Push, In-App, Email, SMS, Webhook
 *  2. Event Types        — Payments, Disputes, Payouts, Fraud, KYC, System
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Prefs {
  pushEnabled:    boolean;
  inAppEnabled:   boolean;
  emailEnabled:   boolean;
  smsEnabled:     boolean;
  webhookEnabled: boolean;
  eventPayment:   boolean;
  eventDispute:   boolean;
  eventPayout:    boolean;
  eventFraud:     boolean;
  eventKyc:       boolean;
  eventSystem:    boolean;
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({
  icon,
  label,
  description,
  value,
  onToggle,
  accentColor = "#6366F1",
}: {
  icon: string;
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  accentColor?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: accentColor + "22" }]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && (
          <Text style={styles.rowDesc}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#374151", true: accentColor }}
        thumbColor={value ? "#FFFFFF" : "#9CA3AF"}
        ios_backgroundColor="#374151"
      />
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error } = trpc.notificationPreferences.get.useQuery(undefined, {
    retry: 1,
  });

  const updateMutation = trpc.notificationPreferences.update.useMutation();

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const toggle = async (key: keyof Prefs) => {
    if (!prefs) return;
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    setSaving(true);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({ [key]: newPrefs[key] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Revert on error
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading preferences…</Text>
      </View>
    );
  }

  if (error || !prefs) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>Failed to load preferences</Text>
        <Text style={styles.errorSub}>Please check your connection and try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notification Preferences</Text>
          <Text style={styles.headerSub}>Choose how you receive alerts</Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color="#6366F1" style={styles.saveIndicator} />
        ) : saved ? (
          <Text style={styles.savedText}>✓ Saved</Text>
        ) : (
          <View style={styles.saveIndicator} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Delivery Channels ─────────────────────────────────────────────── */}
        <SectionHeader
          title="Delivery Channels"
          subtitle="Choose how you receive notifications"
        />
        <View style={styles.card}>
          <ToggleRow
            icon="📱"
            label="Push Notifications"
            description="Instant alerts on your device"
            value={prefs.pushEnabled}
            onToggle={() => toggle("pushEnabled")}
            accentColor="#6366F1"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="🔔"
            label="In-App Feed"
            description="Notifications inside the app"
            value={prefs.inAppEnabled}
            onToggle={() => toggle("inAppEnabled")}
            accentColor="#8B5CF6"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="📧"
            label="Email"
            description="Sent to your registered email"
            value={prefs.emailEnabled}
            onToggle={() => toggle("emailEnabled")}
            accentColor="#06B6D4"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="💬"
            label="SMS"
            description="Text messages to your phone"
            value={prefs.smsEnabled}
            onToggle={() => toggle("smsEnabled")}
            accentColor="#10B981"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="🔗"
            label="Webhooks"
            description="HTTP callbacks to your server"
            value={prefs.webhookEnabled}
            onToggle={() => toggle("webhookEnabled")}
            accentColor="#F59E0B"
          />
        </View>

        {/* ── Event Types ───────────────────────────────────────────────────── */}
        <SectionHeader
          title="Event Types"
          subtitle="Choose which events trigger notifications"
        />
        <View style={styles.card}>
          <ToggleRow
            icon="💳"
            label="Payments"
            description="Completed, failed, or reversed transactions"
            value={prefs.eventPayment}
            onToggle={() => toggle("eventPayment")}
            accentColor="#6366F1"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="⚖️"
            label="Disputes"
            description="Chargebacks and dispute updates"
            value={prefs.eventDispute}
            onToggle={() => toggle("eventDispute")}
            accentColor="#EF4444"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="💸"
            label="Payouts"
            description="Settlement and payout status changes"
            value={prefs.eventPayout}
            onToggle={() => toggle("eventPayout")}
            accentColor="#10B981"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="🚨"
            label="Fraud Alerts"
            description="Suspicious activity and risk flags"
            value={prefs.eventFraud}
            onToggle={() => toggle("eventFraud")}
            accentColor="#F97316"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="🪪"
            label="KYC / Compliance"
            description="Identity verification status updates"
            value={prefs.eventKyc}
            onToggle={() => toggle("eventKyc")}
            accentColor="#06B6D4"
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="⚙️"
            label="System"
            description="Maintenance, updates, and platform alerts"
            value={prefs.eventSystem}
            onToggle={() => toggle("eventSystem")}
            accentColor="#6B7280"
          />
        </View>

        {/* Info note */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Changes are saved automatically. Some channels (email, SMS) may require
            additional verification in your account settings.
          </Text>
        </View>

        <View style={{ height: Platform.OS === "ios" ? 34 : 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1A",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0F0F1A",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 48,
  },
  errorText: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "700",
  },
  errorSub: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: "#0F0F1A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E1E2E",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#1E1E2E",
  },
  backIcon: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "600",
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: "#F1F5F9",
    fontSize: 17,
    fontWeight: "700",
  },
  headerSub: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  saveIndicator: {
    width: 60,
    alignItems: "flex-end",
  },
  savedText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "600",
    width: 60,
    textAlign: "right",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: "#F1F5F9",
    fontSize: 16,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 2,
  },
  card: {
    backgroundColor: "#1E1E2E",
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  rowIconText: {
    fontSize: 20,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
  },
  rowDesc: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#2A2A3E",
    marginLeft: 68,
  },
  infoBox: {
    backgroundColor: "#1E1E2E",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#6366F1",
  },
  infoText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 20,
  },
});
