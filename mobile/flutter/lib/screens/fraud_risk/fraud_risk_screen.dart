import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class FraudRiskScreen extends ConsumerStatefulWidget {
  const FraudRiskScreen({super.key});
  @override
  ConsumerState<FraudRiskScreen> createState() => _FraudRiskScreenState();
}

class _FraudRiskScreenState extends ConsumerState<FraudRiskScreen> {
  List<dynamic> _alerts = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String _severity = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final results = await Future.wait([
        api.getFraudAlerts(severity: _severity == 'all' ? null : _severity),
        api.getFraudStats(),
      ]);
      final alertData = results[0];
      final rows = alertData['rows'] ?? alertData['alerts'] ?? alertData['data'] ?? [];
      setState(() {
        _alerts = rows is List ? rows : [];
        _stats = results[1];
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _dismiss(int alertId) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.dismissFraudAlert(alertId);
      setState(() => _alerts.removeWhere((a) => (a['id'] as int?) == alertId));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Alert dismissed')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Color _severityColor(String s) {
    switch (s) {
      case 'critical': return Colors.red;
      case 'high': return Colors.orange;
      case 'medium': return Colors.amber;
      case 'low': return Colors.blue;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fraud & Risk'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
          ? Center(child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text(_error!),
                ElevatedButton(onPressed: _load, child: const Text('Retry')),
              ],
            ))
          : Column(
              children: [
                // Stats row
                if (_stats != null)
                  Container(
                    color: const Color(0xFF6366F1).withOpacity(0.08),
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _statChip('Total Alerts', '${_stats!['total'] ?? _alerts.length}', Colors.blue),
                        _statChip('Critical', '${_stats!['critical'] ?? 0}', Colors.red),
                        _statChip('Blocked', '${_stats!['blocked'] ?? 0}', Colors.orange),
                        _statChip('Score', '${_stats!['risk_score'] ?? _stats!['score'] ?? 'N/A'}', Colors.purple),
                      ],
                    ),
                  ),
                // Severity filter
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: ['all', 'critical', 'high', 'medium', 'low'].map((s) =>
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(s[0].toUpperCase() + s.substring(1)),
                            selected: _severity == s,
                            selectedColor: _severityColor(s).withOpacity(0.2),
                            onSelected: (_) { setState(() => _severity = s); _load(); },
                          ),
                        ),
                      ).toList(),
                    ),
                  ),
                ),
                Expanded(
                  child: _alerts.isEmpty
                    ? const Center(child: Text('No fraud alerts'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _alerts.length,
                          itemBuilder: (ctx, i) {
                            final a = _alerts[i];
                            final severity = a['severity'] as String? ?? 'low';
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: _severityColor(severity).withOpacity(0.15),
                                  child: Icon(Icons.warning, color: _severityColor(severity), size: 20),
                                ),
                                title: Text(a['type'] ?? a['alert_type'] ?? 'Fraud Alert',
                                  style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(a['description'] ?? a['message'] ?? ''),
                                    Text('Score: ${a['risk_score'] ?? a['score'] ?? 'N/A'}',
                                      style: const TextStyle(fontSize: 12)),
                                  ],
                                ),
                                trailing: TextButton(
                                  onPressed: () => _dismiss(a['id'] as int),
                                  child: const Text('Dismiss', style: TextStyle(color: Colors.grey)),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                ),
              ],
            ),
    );
  }

  Widget _statChip(String label, String value, Color color) {
    return Column(children: [
      Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: color)),
      Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
    ]);
  }
}
