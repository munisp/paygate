import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// ─── Model ───────────────────────────────────────────────────────────────────

class NotificationPreference {
  final String id;
  final String category;
  final String label;
  final String description;
  bool email;
  bool push;
  bool sms;

  NotificationPreference({
    required this.id,
    required this.category,
    required this.label,
    required this.description,
    this.email = true,
    this.push = true,
    this.sms = false,
  });
}

// ─── Provider ────────────────────────────────────────────────────────────────

final notificationPrefsProvider =
    StateNotifierProvider<NotificationPrefsNotifier, List<NotificationPreference>>(
  (ref) => NotificationPrefsNotifier(),
);

class NotificationPrefsNotifier
    extends StateNotifier<List<NotificationPreference>> {
  NotificationPrefsNotifier() : super(_defaultPrefs());

  void toggle(String id, String channel, bool value) {
    state = state.map((p) {
      if (p.id != id) return p;
      switch (channel) {
        case 'email':
          p.email = value;
        case 'push':
          p.push = value;
        case 'sms':
          p.sms = value;
      }
      return p;
    }).toList();
  }
}

List<NotificationPreference> _defaultPrefs() => [
      NotificationPreference(
        id: 'txn_success',
        category: 'Transactions',
        label: 'Transaction Success',
        description: 'When a payment is completed successfully',
        email: true,
        push: true,
        sms: false,
      ),
      NotificationPreference(
        id: 'txn_failed',
        category: 'Transactions',
        label: 'Transaction Failed',
        description: 'When a payment fails or is declined',
        email: true,
        push: true,
        sms: true,
      ),
      NotificationPreference(
        id: 'payout_processed',
        category: 'Payouts',
        label: 'Payout Processed',
        description: 'When a payout is sent to your bank',
        email: true,
        push: true,
        sms: false,
      ),
      NotificationPreference(
        id: 'dispute_opened',
        category: 'Disputes',
        label: 'Dispute Opened',
        description: 'When a customer raises a dispute',
        email: true,
        push: true,
        sms: true,
      ),
      NotificationPreference(
        id: 'dispute_resolved',
        category: 'Disputes',
        label: 'Dispute Resolved',
        description: 'When a dispute is closed',
        email: true,
        push: false,
        sms: false,
      ),
      NotificationPreference(
        id: 'kyc_update',
        category: 'Compliance',
        label: 'KYC Status Update',
        description: 'When your KYC verification status changes',
        email: true,
        push: true,
        sms: false,
      ),
      NotificationPreference(
        id: 'billing_invoice',
        category: 'Billing',
        label: 'Invoice Generated',
        description: 'When a new billing invoice is created',
        email: true,
        push: false,
        sms: false,
      ),
      NotificationPreference(
        id: 'security_login',
        category: 'Security',
        label: 'New Login',
        description: 'When someone logs into your account',
        email: true,
        push: true,
        sms: true,
      ),
    ];

// ─── Screen ──────────────────────────────────────────────────────────────────

class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPrefsProvider);

    // Group by category
    final grouped = <String, List<NotificationPreference>>{};
    for (final p in prefs) {
      grouped.putIfAbsent(p.category, () => []).add(p);
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Notification Preferences',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          TextButton(
            onPressed: () async {
              final prefs = ref.read(notificationPrefsProvider);
              final prefsMap = {
                for (final p in prefs)
                  p.id: {'email': p.email, 'push': p.push, 'sms': p.sms}
              };
              try {
                await ApiService.instance.post('/notifications/preferences', prefsMap);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Preferences saved'),
                      backgroundColor: Color(0xFF10B981),
                    ),
                  );
                }
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Failed to save preferences'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('Save', style: TextStyle(color: Color(0xFF6366F1))),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Channel header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Expanded(child: SizedBox()),
                SizedBox(
                  width: 48,
                  child: Text('Email',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 11,
                          fontWeight: FontWeight.w600)),
                ),
                SizedBox(
                  width: 48,
                  child: Text('Push',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 11,
                          fontWeight: FontWeight.w600)),
                ),
                SizedBox(
                  width: 48,
                  child: Text('SMS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 11,
                          fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Grouped preferences
          ...grouped.entries.map((entry) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.key.toUpperCase(),
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: entry.value.map((pref) {
                        return _PrefRow(
                          pref: pref,
                          onToggle: (channel, value) {
                            ref
                                .read(notificationPrefsProvider.notifier)
                                .toggle(pref.id, channel, value);
                          },
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              )),
        ],
      ),
    );
  }
}

// ─── Preference Row ───────────────────────────────────────────────────────────

class _PrefRow extends StatelessWidget {
  final NotificationPreference pref;
  final void Function(String channel, bool value) onToggle;

  const _PrefRow({required this.pref, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(pref.label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(pref.description,
                    style: const TextStyle(
                        color: Color(0xFF64748B), fontSize: 12)),
              ],
            ),
          ),
          SizedBox(
            width: 48,
            child: Transform.scale(
              scale: 0.7,
              child: Switch(
                value: pref.email,
                onChanged: (v) => onToggle('email', v),
                activeColor: const Color(0xFF6366F1),
              ),
            ),
          ),
          SizedBox(
            width: 48,
            child: Transform.scale(
              scale: 0.7,
              child: Switch(
                value: pref.push,
                onChanged: (v) => onToggle('push', v),
                activeColor: const Color(0xFF6366F1),
              ),
            ),
          ),
          SizedBox(
            width: 48,
            child: Transform.scale(
              scale: 0.7,
              child: Switch(
                value: pref.sms,
                onChanged: (v) => onToggle('sms', v),
                activeColor: const Color(0xFF6366F1),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
