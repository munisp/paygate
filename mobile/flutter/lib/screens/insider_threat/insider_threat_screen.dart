import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// ─── Models ───────────────────────────────────────────────────────────────────

class InsiderThreatAlert {
  final String id;
  final String alertType;
  final String actorId;
  final int riskScore;
  final String status;
  final DateTime createdAt;
  final Map<String, dynamic>? metadata;

  InsiderThreatAlert({
    required this.id,
    required this.alertType,
    required this.actorId,
    required this.riskScore,
    required this.status,
    required this.createdAt,
    this.metadata,
  });

  factory InsiderThreatAlert.fromJson(Map<String, dynamic> json) {
    return InsiderThreatAlert(
      id: json['id'] as String,
      alertType: json['alertType'] as String? ?? 'unknown',
      actorId: json['actorId'] as String? ?? '',
      riskScore: (json['riskScore'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'open',
      createdAt: json['createdAt'] is String
          ? DateTime.parse(json['createdAt'] as String)
          : DateTime.fromMillisecondsSinceEpoch(
              (json['createdAt'] as num).toInt()),
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }
}

class ApprovalRequest {
  final String requestId;
  final String action;
  final String actorId;
  final DateTime createdAt;

  ApprovalRequest({
    required this.requestId,
    required this.action,
    required this.actorId,
    required this.createdAt,
  });

  factory ApprovalRequest.fromJson(Map<String, dynamic> json) {
    return ApprovalRequest(
      requestId: json['requestId'] as String,
      action: json['action'] as String? ?? '',
      actorId: json['actorId'] as String? ?? '',
      createdAt: json['createdAt'] is String
          ? DateTime.parse(json['createdAt'] as String)
          : DateTime.fromMillisecondsSinceEpoch(
              (json['createdAt'] as num).toInt()),
    );
  }
}

class ThreatPolicy {
  final String id;
  final String name;
  final String description;
  final String verdict;
  bool enabled;

  ThreatPolicy({
    required this.id,
    required this.name,
    required this.description,
    required this.verdict,
    required this.enabled,
  });

  factory ThreatPolicy.fromJson(Map<String, dynamic> json) {
    return ThreatPolicy(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      verdict: json['verdict'] as String? ?? 'flag',
      enabled: json['enabled'] as bool? ?? true,
    );
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final insiderAlertsProvider =
    FutureProvider.autoDispose<List<InsiderThreatAlert>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/api/trpc/insiderThreat.listAlerts?input={"status":"open","limit":50}');
  final alerts = (res['result']?['data']?['alerts'] as List? ?? []);
  return alerts.map((e) => InsiderThreatAlert.fromJson(e as Map<String, dynamic>)).toList();
});

final insiderStatsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/api/trpc/insiderThreat.getStats');
  return (res['result']?['data'] as Map<String, dynamic>?) ?? {};
});

final pendingApprovalsProvider =
    FutureProvider.autoDispose<List<ApprovalRequest>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/api/trpc/insiderThreat.listPendingApprovals');
  final approvals = (res['result']?['data']?['approvals'] as List? ?? []);
  return approvals.map((e) => ApprovalRequest.fromJson(e as Map<String, dynamic>)).toList();
});

final threatPoliciesProvider =
    FutureProvider.autoDispose<List<ThreatPolicy>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/api/trpc/insiderThreat.listPolicies');
  final policies = (res['result']?['data']?['policies'] as List? ?? []);
  return policies.map((e) => ThreatPolicy.fromJson(e as Map<String, dynamic>)).toList();
});

// ─── Design Tokens ────────────────────────────────────────────────────────────

class _Colors {
  static const background = Color(0xFF0F172A);
  static const card = Color(0xFF1E293B);
  static const border = Color(0xFF334155);
  static const text = Color(0xFFF1F5F9);
  static const muted = Color(0xFF94A3B8);
  static const primary = Color(0xFF6366F1);
  static const success = Color(0xFF10B981);
  static const error = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);
  static const critical = Color(0xFFDC2626);
  static const high = Color(0xFFEA580C);
  static const medium = Color(0xFFD97706);
  static const low = Color(0xFF16A34A);
}

Color _riskColor(int score) {
  if (score >= 80) return _Colors.critical;
  if (score >= 60) return _Colors.high;
  if (score >= 40) return _Colors.medium;
  return _Colors.low;
}

Color _statusColor(String status) {
  switch (status) {
    case 'open': return _Colors.error;
    case 'acknowledged': return _Colors.warning;
    case 'resolved': return _Colors.success;
    default: return _Colors.muted;
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

class InsiderThreatScreen extends ConsumerStatefulWidget {
  const InsiderThreatScreen({super.key});

  @override
  ConsumerState<InsiderThreatScreen> createState() => _InsiderThreatScreenState();
}

class _InsiderThreatScreenState extends ConsumerState<InsiderThreatScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _Colors.background,
      appBar: AppBar(
        backgroundColor: _Colors.card,
        foregroundColor: _Colors.text,
        title: Row(children: [
          const Text('Insider Threat',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _Colors.error.withOpacity(0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: const Text('LIVE',
                style: TextStyle(
                    color: _Colors.error,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
          ),
        ]),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: _Colors.primary,
          labelColor: _Colors.primary,
          unselectedLabelColor: _Colors.muted,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'Dashboard'),
            Tab(text: 'Alerts'),
            Tab(text: 'Approvals'),
            Tab(text: 'Policies'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _DashboardTab(),
          _AlertsTab(),
          _ApprovalsTab(),
          _PoliciesTab(),
        ],
      ),
    );
  }
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

class _DashboardTab extends ConsumerWidget {
  const _DashboardTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(insiderStatsProvider);

    return stats.when(
      loading: () => const Center(child: CircularProgressIndicator(color: _Colors.primary)),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: _Colors.error))),
      data: (data) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: _StatCard(label: 'Open Alerts', value: '${data['openAlerts'] ?? 0}', color: _Colors.error)),
            const SizedBox(width: 10),
            Expanded(child: _StatCard(label: 'Pending Approval', value: '${data['pendingApprovals'] ?? 0}', color: _Colors.warning)),
            const SizedBox(width: 10),
            Expanded(child: _StatCard(label: 'Avg Risk', value: '${data['avgRiskScore'] ?? 0}', color: _Colors.primary)),
          ]),
          const SizedBox(height: 20),
          const Text('Security Controls',
              style: TextStyle(color: _Colors.text, fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          ..._controls.map((c) => _ControlCard(label: c['label']!, desc: c['desc']!)),
        ]),
      ),
    );
  }

  static const _controls = [
    {'label': 'Session Binding', 'desc': 'Detects session hijacking via fingerprint mismatch'},
    {'label': 'Velocity Gate', 'desc': 'Blocks excessive privileged action rates'},
    {'label': '4-Eyes Approval', 'desc': 'Requires dual-control for critical operations'},
    {'label': 'UEBA Scoring', 'desc': 'ML-based behavioural anomaly detection'},
    {'label': 'Geo Anomaly', 'desc': 'Flags logins from unexpected countries'},
    {'label': 'Off-Hours Alert', 'desc': 'Detects access outside business hours'},
  ];
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────

class _AlertsTab extends ConsumerWidget {
  const _AlertsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(insiderAlertsProvider);

    return alertsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: _Colors.primary)),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: _Colors.error))),
      data: (alerts) => alerts.isEmpty
          ? const Center(child: Text('No open alerts', style: TextStyle(color: _Colors.muted)))
          : RefreshIndicator(
              color: _Colors.primary,
              onRefresh: () async => ref.invalidate(insiderAlertsProvider),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: alerts.length,
                itemBuilder: (ctx, i) => _AlertCard(alert: alerts[i], ref: ref),
              ),
            ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  final InsiderThreatAlert alert;
  final WidgetRef ref;
  const _AlertCard({required this.alert, required this.ref});

  @override
  Widget build(BuildContext context) {
    final api = ref.read(apiServiceProvider);
    final fmt = DateFormat('MMM d, HH:mm');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _Colors.card,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _Badge(text: 'Risk ${alert.riskScore}', color: _riskColor(alert.riskScore)),
          const SizedBox(width: 8),
          _Badge(text: alert.status, color: _statusColor(alert.status)),
        ]),
        const SizedBox(height: 8),
        Text(alert.alertType.replaceAll('_', ' '),
            style: const TextStyle(color: _Colors.text, fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Actor: ${alert.actorId}',
            style: const TextStyle(color: _Colors.muted, fontSize: 12)),
        Text(fmt.format(alert.createdAt.toLocal()),
            style: const TextStyle(color: _Colors.muted, fontSize: 11)),
        if (alert.status == 'open') ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: _ActionButton(
                label: 'Acknowledge',
                color: _Colors.warning,
                onTap: () async {
                  await api.post('/api/trpc/insiderThreat.acknowledgeAlert',
                      {'alertId': alert.id});
                  ref.invalidate(insiderAlertsProvider);
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ActionButton(
                label: 'Resolve',
                color: _Colors.success,
                onTap: () async {
                  await api.post('/api/trpc/insiderThreat.resolveAlert',
                      {'alertId': alert.id});
                  ref.invalidate(insiderAlertsProvider);
                },
              ),
            ),
          ]),
        ],
      ]),
    );
  }
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────

class _ApprovalsTab extends ConsumerWidget {
  const _ApprovalsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final approvalsAsync = ref.watch(pendingApprovalsProvider);

    return approvalsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: _Colors.primary)),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: _Colors.error))),
      data: (approvals) => approvals.isEmpty
          ? const Center(child: Text('No pending approvals', style: TextStyle(color: _Colors.muted)))
          : RefreshIndicator(
              color: _Colors.primary,
              onRefresh: () async => ref.invalidate(pendingApprovalsProvider),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: approvals.length,
                itemBuilder: (ctx, i) => _ApprovalCard(approval: approvals[i], ref: ref),
              ),
            ),
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  final ApprovalRequest approval;
  final WidgetRef ref;
  const _ApprovalCard({required this.approval, required this.ref});

  @override
  Widget build(BuildContext context) {
    final api = ref.read(apiServiceProvider);
    final fmt = DateFormat('MMM d, HH:mm');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _Colors.card, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(approval.action.replaceAll('_', ' '),
            style: const TextStyle(color: _Colors.text, fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Requested by: ${approval.actorId}',
            style: const TextStyle(color: _Colors.muted, fontSize: 12)),
        Text(fmt.format(approval.createdAt.toLocal()),
            style: const TextStyle(color: _Colors.muted, fontSize: 11)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _ActionButton(
              label: 'Approve',
              color: _Colors.success,
              onTap: () async {
                await api.post('/api/trpc/insiderThreat.approveAction',
                    {'requestId': approval.requestId});
                ref.invalidate(pendingApprovalsProvider);
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ActionButton(
              label: 'Reject',
              color: _Colors.error,
              onTap: () async {
                await api.post('/api/trpc/insiderThreat.rejectAction', {
                  'requestId': approval.requestId,
                  'reason': 'Rejected by mobile operator',
                });
                ref.invalidate(pendingApprovalsProvider);
              },
            ),
          ),
        ]),
      ]),
    );
  }
}

// ─── Policies Tab ─────────────────────────────────────────────────────────────

class _PoliciesTab extends ConsumerWidget {
  const _PoliciesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final policiesAsync = ref.watch(threatPoliciesProvider);

    return policiesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: _Colors.primary)),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: _Colors.error))),
      data: (policies) => ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: policies.length,
        itemBuilder: (ctx, i) => _PolicyCard(policy: policies[i], ref: ref),
      ),
    );
  }
}

class _PolicyCard extends StatefulWidget {
  final ThreatPolicy policy;
  final WidgetRef ref;
  const _PolicyCard({required this.policy, required this.ref});

  @override
  State<_PolicyCard> createState() => _PolicyCardState();
}

class _PolicyCardState extends State<_PolicyCard> {
  late bool _enabled;

  @override
  void initState() {
    super.initState();
    _enabled = widget.policy.enabled;
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.ref.read(apiServiceProvider);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _Colors.card, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.policy.name,
                style: const TextStyle(color: _Colors.text, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(widget.policy.description,
                style: const TextStyle(color: _Colors.muted, fontSize: 12)),
            const SizedBox(height: 4),
            Text('Verdict: ${widget.policy.verdict}',
                style: const TextStyle(color: _Colors.primary, fontSize: 12, fontWeight: FontWeight.w500)),
          ]),
        ),
        Switch(
          value: _enabled,
          activeColor: _Colors.primary,
          onChanged: (val) async {
            setState(() => _enabled = val);
            await api.post('/api/trpc/insiderThreat.updatePolicy',
                {'policyId': widget.policy.id, 'enabled': val});
            widget.ref.invalidate(threatPoliciesProvider);
          },
        ),
      ]),
    );
  }
}

// ─── Shared Widgets ───────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _Colors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border(top: BorderSide(color: color, width: 3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: _Colors.muted, fontSize: 11)),
      ]),
    );
  }
}

class _ControlCard extends StatelessWidget {
  final String label;
  final String desc;
  const _ControlCard({required this.label, required this.desc});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _Colors.card, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Container(
          width: 8, height: 8,
          decoration: const BoxDecoration(color: _Colors.success, shape: BoxShape.circle),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: _Colors.text, fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(desc, style: const TextStyle(color: _Colors.muted, fontSize: 12)),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: _Colors.success.withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Text('Active',
              style: TextStyle(color: _Colors.success, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;
  const _Badge({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text,
          style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionButton({required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.15),
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(label,
            style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
