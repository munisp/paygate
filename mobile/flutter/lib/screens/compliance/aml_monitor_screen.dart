import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// AML Monitor Screen — fully wired to PayGate tRPC backend.
class AmlMonitorScreen extends StatefulWidget {
  const AmlMonitorScreen({super.key});
  @override
  State<AmlMonitorScreen> createState() => __AmlMonitorScreenState();
}

class __AmlMonitorScreenState extends State<AmlMonitorScreen> {
  bool _isLoading = false;
  String? _error;
  dynamic _data;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiService(baseUrl: auth.apiBaseUrl, token: auth.token);
      final result = await api.query('compliance.amlAlerts.list');
      setState(() { _data = result; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _isLoading = false; });
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return '-';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return iso.length > 10 ? iso.substring(0, 10) : iso;
    }
  }

  Widget _emptyState(String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.security, color: const Color(0xFF334155), size: 64),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(color: Color(0xFFF1F5F9), fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(subtitle, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }


  Widget _buildContent(ThemeData theme) {
    final alerts = (_data as List?) ?? [];
    if (alerts.isEmpty) {
      return _emptyState('No AML Alerts', 'All transactions are within compliance thresholds.');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: alerts.length,
      itemBuilder: (ctx, i) {
        final a = alerts[i] as Map<String, dynamic>;
        final risk = (a['riskScore'] as num?)?.toDouble() ?? 0.0;
        final color = risk >= 0.8 ? const Color(0xFFEF4444)
            : risk >= 0.5 ? const Color(0xFFF59E0B)
            : const Color(0xFF22C55E);
        return Card(
          color: const Color(0xFF1E293B),
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: color.withOpacity(0.15),
              child: Icon(Icons.warning_amber_rounded, color: color, size: 20),
            ),
            title: Text(
              a['transactionRef']?.toString() ?? 'Unknown Ref',
              style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w600, fontSize: 14),
            ),
            subtitle: Text(
              'Risk: ${(risk * 100).toStringAsFixed(0)}%  •  ${a['alertType'] ?? 'Suspicious Activity'}',
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                a['status']?.toString().toUpperCase() ?? 'OPEN',
                style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        );
      },
    );
  }


  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        title: const Text(
          'AML Monitor',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 48),
                      const SizedBox(height: 16),
                      Text('Failed to load AML Monitor', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _loadData,
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _buildContent(theme),
    );
  }
}
