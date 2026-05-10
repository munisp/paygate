import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

final profileProvider = FutureProvider.autoDispose((ref) async {
  await Future.delayed(const Duration(milliseconds: 400));
  return {
    'name': 'Merchant Admin',
    'email': 'admin@merchant.com',
    'phone': '+234 801 234 5678',
    'role': 'admin',
    'merchantName': 'PayGate Demo Merchant',
    'merchantId': 'MCH_001',
    'kycStatus': 'verified',
    'joinedAt': '2024-01-15',
    'lastLogin': '2026-05-09T22:00:00Z',
    'twoFactorEnabled': true,
    'notificationsEnabled': true,
  };
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Profile',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: Colors.white),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Edit profile coming soon')),
              );
            },
          ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF6366F1)),
        ),
        error: (e, _) => Center(
          child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
        ),
        data: (profile) => _ProfileBody(profile: profile),
      ),
    );
  }
}

// ─── Profile Body ─────────────────────────────────────────────────────────────

class _ProfileBody extends StatelessWidget {
  final Map<String, dynamic> profile;
  const _ProfileBody({required this.profile});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Avatar + Name
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: const Color(0xFF6366F1),
                  child: Text(
                    (profile['name'] as String).substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  profile['name'] as String,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6366F1).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    (profile['role'] as String).toUpperCase(),
                    style: const TextStyle(
                      color: Color(0xFF6366F1),
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Merchant Info
          _SectionCard(
            title: 'Merchant Information',
            children: [
              _InfoRow(label: 'Merchant Name', value: profile['merchantName'] as String),
              _InfoRow(label: 'Merchant ID', value: profile['merchantId'] as String),
              _InfoRow(
                label: 'KYC Status',
                value: profile['kycStatus'] as String,
                valueColor: profile['kycStatus'] == 'verified'
                    ? const Color(0xFF10B981)
                    : const Color(0xFFF59E0B),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Contact Info
          _SectionCard(
            title: 'Contact Information',
            children: [
              _InfoRow(label: 'Email', value: profile['email'] as String),
              _InfoRow(label: 'Phone', value: profile['phone'] as String),
              _InfoRow(label: 'Joined', value: profile['joinedAt'] as String),
            ],
          ),
          const SizedBox(height: 12),

          // Security
          _SectionCard(
            title: 'Security',
            children: [
              _ToggleRow(
                label: 'Two-Factor Authentication',
                value: profile['twoFactorEnabled'] as bool,
                icon: Icons.security,
              ),
              _ToggleRow(
                label: 'Push Notifications',
                value: profile['notificationsEnabled'] as bool,
                icon: Icons.notifications_outlined,
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Actions
          _SectionCard(
            title: 'Account Actions',
            children: [
              _ActionRow(
                label: 'Change Password',
                icon: Icons.lock_outline,
                onTap: () {},
              ),
              _ActionRow(
                label: 'Download Account Statement',
                icon: Icons.download_outlined,
                onTap: () {},
              ),
              _ActionRow(
                label: 'Sign Out',
                icon: Icons.logout,
                color: const Color(0xFFEF4444),
                onTap: () {},
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Section Card ─────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _InfoRow({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 14)),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

class _ToggleRow extends StatelessWidget {
  final String label;
  final bool value;
  final IconData icon;

  const _ToggleRow({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF64748B), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label,
                style: const TextStyle(color: Colors.white, fontSize: 14)),
          ),
          Switch(
            value: value,
            onChanged: (_) {},
            activeColor: const Color(0xFF6366F1),
          ),
        ],
      ),
    );
  }
}

// ─── Action Row ───────────────────────────────────────────────────────────────

class _ActionRow extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  const _ActionRow({
    required this.label,
    required this.icon,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.white;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, color: c, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: TextStyle(color: c, fontSize: 14)),
            ),
            Icon(Icons.chevron_right, color: c.withOpacity(0.5), size: 20),
          ],
        ),
      ),
    );
  }
}
