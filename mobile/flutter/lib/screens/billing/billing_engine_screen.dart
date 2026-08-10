import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../models/billing_config.dart';

/// Billing Engine Screen — Wave 116
/// Displays active billing config, version history, and audit log.
/// Read-only for non-admin users; admin users can create/activate configs.
class BillingEngineScreen extends ConsumerStatefulWidget {
  const BillingEngineScreen({super.key});

  @override
  ConsumerState<BillingEngineScreen> createState() => _BillingEngineScreenState();
}

class _BillingEngineScreenState extends ConsumerState<BillingEngineScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  BillingConfig? _activeConfig;
  List<BillingConfig> _versions = [];
  List<BillingAuditEntry> _auditLog = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final tenantId = ref.read(currentTenantIdProvider);
      final results = await Future.wait([
        api.getBillingConfig(tenantId),
        api.getBillingVersions(tenantId),
        api.getBillingAuditLog(tenantId),
      ]);
      setState(() {
        _activeConfig = results[0] as BillingConfig?;
        _versions = results[1] as List<BillingConfig>;
        _auditLog = results[2] as List<BillingAuditEntry>;
        _isLoading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing Engine'),
        backgroundColor: theme.colorScheme.surface,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Active Config'),
            Tab(text: 'History'),
            Tab(text: 'Audit Log'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(error: _error!, onRetry: _loadData)
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _ActiveConfigTab(config: _activeConfig),
                    _VersionHistoryTab(versions: _versions),
                    _AuditLogTab(entries: _auditLog),
                  ],
                ),
    );
  }
}

// ── Active Config Tab ─────────────────────────────────────────────────────────

class _ActiveConfigTab extends StatelessWidget {
  final BillingConfig? config;
  const _ActiveConfigTab({required this.config});

  @override
  Widget build(BuildContext context) {
    if (config == null) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.calculate_outlined, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('No active billing config', style: TextStyle(color: Colors.grey)),
            SizedBox(height: 8),
            Text('Contact your platform admin to set up billing.',
                style: TextStyle(color: Colors.grey, fontSize: 12)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _ConfigCard(
            title: 'Pricing Model',
            value: config!.pricingModel.toUpperCase().replaceAll('_', ' '),
            icon: Icons.account_balance_wallet,
            color: Colors.blue,
          ),
          const SizedBox(height: 12),
          _ConfigCard(
            title: 'Transaction Fee Rate',
            value: '${(config!.feeRate * 100).toStringAsFixed(2)}%',
            subtitle: 'Cap: ₦${(config!.feeCapKobo / 100).toStringAsFixed(0)}',
            icon: Icons.percent,
            color: Colors.green,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _ConfigCard(
                  title: 'Platform Share',
                  value: '${(config!.platformShare * 100).toStringAsFixed(0)}%',
                  icon: Icons.business,
                  color: Colors.purple,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _ConfigCard(
                  title: 'Reseller Share',
                  value: '${(config!.resellerShare * 100).toStringAsFixed(0)}%',
                  icon: Icons.people,
                  color: Colors.orange,
                ),
              ),
            ],
          ),
          if (config!.signOnFeeKobo > 0) ...[
            const SizedBox(height: 12),
            _ConfigCard(
              title: 'Sign-On Fee',
              value: '₦${(config!.signOnFeeKobo / 100).toStringAsFixed(0)}',
              subtitle: 'Platform: ${(config!.signOnPlatformShare * 100).toStringAsFixed(0)}%',
              icon: Icons.handshake,
              color: Colors.teal,
            ),
          ],
          if (config!.subscriptionFeeKobo > 0) ...[
            const SizedBox(height: 12),
            _ConfigCard(
              title: 'Monthly Subscription',
              value: '₦${(config!.subscriptionFeeKobo / 100).toStringAsFixed(0)}/mo',
              subtitle: 'Platform: ${(config!.subscriptionPlatformShare * 100).toStringAsFixed(0)}%',
              icon: Icons.repeat,
              color: Colors.indigo,
            ),
          ],
          const SizedBox(height: 12),
          _StatusBadge(
            status: config!.status,
            version: config!.version,
            effectiveFrom: config!.effectiveFrom,
          ),
        ],
      ),
    );
  }
}

// ── Version History Tab ───────────────────────────────────────────────────────

class _VersionHistoryTab extends StatelessWidget {
  final List<BillingConfig> versions;
  const _VersionHistoryTab({required this.versions});

  @override
  Widget build(BuildContext context) {
    if (versions.isEmpty) {
      return const Center(child: Text('No billing config history'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: versions.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final v = versions[i];
        return Card(
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: v.active ? Colors.green : Colors.grey.shade300,
              child: Text('v${v.version}',
                  style: TextStyle(
                      color: v.active ? Colors.white : Colors.grey.shade700,
                      fontSize: 12)),
            ),
            title: Text(v.pricingModel.toUpperCase().replaceAll('_', ' ')),
            subtitle: Text(
              '${(v.feeRate * 100).toStringAsFixed(2)}% fee · ${(v.platformShare * 100).toStringAsFixed(0)}/${(v.resellerShare * 100).toStringAsFixed(0)} split',
            ),
            trailing: Chip(
              label: Text(v.status,
                  style: const TextStyle(fontSize: 11)),
              backgroundColor: _statusColor(v.status).withOpacity(0.15),
            ),
          ),
        );
      },
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'active': return Colors.green;
      case 'draft': return Colors.blue;
      case 'superseded': return Colors.grey;
      default: return Colors.orange;
    }
  }
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

class _AuditLogTab extends StatelessWidget {
  final List<BillingAuditEntry> entries;
  const _AuditLogTab({required this.entries});

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return const Center(child: Text('No audit log entries'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: entries.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final e = entries[i];
        return ListTile(
          leading: Icon(_actionIcon(e.action), color: _actionColor(e.action), size: 20),
          title: Text(e.action.toUpperCase(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('By: ${e.actorRole} (${e.actorId})', style: const TextStyle(fontSize: 12)),
              if (e.reason != null)
                Text('Reason: ${e.reason}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
          trailing: Text(
            _formatDate(e.createdAt),
            style: const TextStyle(fontSize: 11, color: Colors.grey),
          ),
          isThreeLine: e.reason != null,
        );
      },
    );
  }

  IconData _actionIcon(String action) {
    switch (action) {
      case 'created': return Icons.add_circle_outline;
      case 'updated': return Icons.edit_outlined;
      case 'activated': return Icons.check_circle_outline;
      case 'superseded': return Icons.history;
      default: return Icons.info_outline;
    }
  }

  Color _actionColor(String action) {
    switch (action) {
      case 'created': return Colors.blue;
      case 'updated': return Colors.orange;
      case 'activated': return Colors.green;
      case 'superseded': return Colors.grey;
      default: return Colors.purple;
    }
  }

  String _formatDate(DateTime dt) {
    return '${dt.day}/${dt.month} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

// ── Helper Widgets ────────────────────────────────────────────────────────────

class _ConfigCard extends StatelessWidget {
  final String title;
  final String value;
  final String? subtitle;
  final IconData icon;
  final Color color;

  const _ConfigCard({
    required this.title,
    required this.value,
    this.subtitle,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  if (subtitle != null)
                    Text(subtitle!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  final int version;
  final DateTime? effectiveFrom;

  const _StatusBadge({required this.status, required this.version, this.effectiveFrom});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.green.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.verified, color: Colors.green),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Version $version — ${status.toUpperCase()}',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                  if (effectiveFrom != null)
                    Text('Effective: ${effectiveFrom!.toLocal()}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text('Failed to load billing data', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(error, style: const TextStyle(color: Colors.grey, fontSize: 12), textAlign: TextAlign.center),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

// ── Models ────────────────────────────────────────────────────────────────────

class BillingConfig {
  final String id;
  final String tenantId;
  final String status;
  final bool active;
  final String pricingModel;
  final double feeRate;
  final int feeCapKobo;
  final int feeFloorKobo;
  final double platformShare;
  final double resellerShare;
  final int signOnFeeKobo;
  final double signOnPlatformShare;
  final int subscriptionFeeKobo;
  final double subscriptionPlatformShare;
  final int version;
  final DateTime? effectiveFrom;

  const BillingConfig({
    required this.id,
    required this.tenantId,
    required this.status,
    required this.active,
    required this.pricingModel,
    required this.feeRate,
    required this.feeCapKobo,
    required this.feeFloorKobo,
    required this.platformShare,
    required this.resellerShare,
    required this.signOnFeeKobo,
    required this.signOnPlatformShare,
    required this.subscriptionFeeKobo,
    required this.subscriptionPlatformShare,
    required this.version,
    this.effectiveFrom,
  });

  factory BillingConfig.fromJson(Map<String, dynamic> json) => BillingConfig(
    id: json['id'] as String,
    tenantId: json['tenantId'] as String,
    status: json['status'] as String,
    active: json['active'] as bool,
    pricingModel: json['pricingModel'] as String,
    feeRate: (json['feeRate'] as num).toDouble(),
    feeCapKobo: json['feeCapKobo'] as int,
    feeFloorKobo: json['feeFloorKobo'] as int,
    platformShare: (json['platformShare'] as num).toDouble(),
    resellerShare: (json['resellerShare'] as num).toDouble(),
    signOnFeeKobo: json['signOnFeeKobo'] as int? ?? 0,
    signOnPlatformShare: (json['signOnPlatformShare'] as num?)?.toDouble() ?? 0.70,
    subscriptionFeeKobo: json['subscriptionFeeKobo'] as int? ?? 0,
    subscriptionPlatformShare: (json['subscriptionPlatformShare'] as num?)?.toDouble() ?? 0.65,
    version: json['version'] as int,
    effectiveFrom: json['effectiveFrom'] != null ? DateTime.parse(json['effectiveFrom'] as String) : null,
  );
}

class BillingAuditEntry {
  final String id;
  final String actorId;
  final String actorRole;
  final String action;
  final String? reason;
  final DateTime createdAt;

  const BillingAuditEntry({
    required this.id,
    required this.actorId,
    required this.actorRole,
    required this.action,
    this.reason,
    required this.createdAt,
  });

  factory BillingAuditEntry.fromJson(Map<String, dynamic> json) => BillingAuditEntry(
    id: json['id'] as String,
    actorId: json['actorId'] as String,
    actorRole: json['actorRole'] as String,
    action: json['action'] as String,
    reason: json['reason'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

// ── Placeholder providers (replace with actual Riverpod providers) ────────────
final apiServiceProvider = Provider<ApiService>((ref) => ApiService());
final currentTenantIdProvider = Provider<String>((ref) => 'tenant-demo-001');
