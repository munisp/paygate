/**
 * NotificationDetailSheet
 *
 * A bottom sheet that shows the full details of a single notification.
 * Features:
 *  - Full title, body, metadata display
 *  - Priority badge (critical/high/medium/low)
 *  - Timestamp
 *  - "Mark as Read" and "Dismiss" action buttons
 *  - "Go to Transaction / Dispute / Payout" deep-link button when actionUrl is set
 *  - Animated slide-up from bottom
 */
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useNotificationStore, AppNotification } from "@/stores/notificationStore";

// ─── Priority config ──────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  critical: { color: "#EF4444", label: "Critical", bg: "#FEF2F2" },
  high:     { color: "#F97316", label: "High",     bg: "#FFF7ED" },
  medium:   { color: "#EAB308", label: "Medium",   bg: "#FEFCE8" },
  low:      { color: "#6B7280", label: "Low",      bg: "#F9FAFB" },
} as const;

// ─── Type icon map ────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  payment:    "💳",
  dispute:    "⚖️",
  payout:     "💸",
  fraud:      "🚨",
  kyc:        "🪪",
  settlement: "🏦",
  system:     "⚙️",
};

interface Props {
  notification: AppNotification | null;
  visible: boolean;
  onClose: () => void;
}

export function NotificationDetailSheet({ notification, visible, onClose }: Props) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const { markRead, dismiss } = useNotificationStore();

  const markReadMutation = trpc.notifications.markRead.useMutation();
  const dismissMutation  = trpc.notifications.dismiss.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!notification) return null;

  const priority = PRIORITY_CONFIG[notification.priority] ?? PRIORITY_CONFIG.medium;
  const icon = TYPE_ICON[notification.type] ?? "🔔";

  const handleMarkRead = async () => {
    markRead(notification.id);
    try {
      await markReadMutation.mutateAsync({ id: notification.id });
      utils.notifications.list.invalidate();
    } catch {}
    onClose();
  };

  const handleDismiss = async () => {
    dismiss(notification.id);
    try {
      await dismissMutation.mutateAsync({ id: notification.id });
      utils.notifications.list.invalidate();
    } catch {}
    onClose();
  };

  const handleNavigate = () => {
    if (notification.actionUrl) {
      onClose();
      setTimeout(() => router.push(notification.actionUrl as any), 300);
    }
  };

  // Parse metadata for extra details
  let meta: Record<string, any> = {};
  try {
    if (notification.metadata) meta = JSON.parse(notification.metadata);
  } catch {}

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.headerText}>
              <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                <Text style={[styles.priorityLabel, { color: priority.color }]}>
                  {priority.label}
                </Text>
              </View>
              <Text style={styles.type}>{notification.type.toUpperCase()}</Text>
            </View>
            {!notification.isRead && <View style={styles.unreadDot} />}
          </View>

          {/* Title */}
          <Text style={styles.title}>{notification.title}</Text>

          {/* Body */}
          <Text style={styles.body}>{notification.body}</Text>

          {/* Metadata details */}
          {Object.keys(meta).length > 0 && (
            <View style={styles.metaBox}>
              <Text style={styles.metaTitle}>Details</Text>
              {Object.entries(meta)
                .filter(([k]) => !["notificationId", "type", "priority"].includes(k))
                .slice(0, 8)
                .map(([key, val]) => (
                  <View key={key} style={styles.metaRow}>
                    <Text style={styles.metaKey}>
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </Text>
                    <Text style={styles.metaVal} numberOfLines={1}>
                      {String(val)}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Timestamp */}
          <Text style={styles.timestamp}>
            {new Date(notification.createdAt).toLocaleString()}
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            {notification.actionUrl && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleNavigate}
              >
                <Text style={styles.btnPrimaryText}>View Details →</Text>
              </TouchableOpacity>
            )}

            {!notification.isRead && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={handleMarkRead}
              >
                <Text style={styles.btnSecondaryText}>Mark as Read</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={handleDismiss}
            >
              <Text style={styles.btnDangerText}>Dismiss</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom safe area */}
          <View style={{ height: Platform.OS === "ios" ? 34 : 16 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1E1E2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#3F3F5A",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  icon: {
    fontSize: 32,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  priorityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  priorityLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  type: {
    fontSize: 11,
    color: "#6B7280",
    letterSpacing: 1,
    fontWeight: "600",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#6366F1",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F1F5F9",
    marginBottom: 8,
    lineHeight: 28,
  },
  body: {
    fontSize: 15,
    color: "#94A3B8",
    lineHeight: 22,
    marginBottom: 16,
  },
  metaBox: {
    backgroundColor: "#2A2A3E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  metaTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metaKey: {
    fontSize: 13,
    color: "#6B7280",
    textTransform: "capitalize",
    flex: 1,
  },
  metaVal: {
    fontSize: 13,
    color: "#CBD5E1",
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  timestamp: {
    fontSize: 12,
    color: "#4B5563",
    marginBottom: 20,
    textAlign: "right",
  },
  actions: {
    gap: 10,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#6366F1",
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  btnSecondary: {
    backgroundColor: "#2A2A3E",
    borderWidth: 1,
    borderColor: "#3F3F5A",
  },
  btnSecondaryText: {
    color: "#CBD5E1",
    fontWeight: "600",
    fontSize: 15,
  },
  btnDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#374151",
  },
  btnDangerText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 15,
  },
});
