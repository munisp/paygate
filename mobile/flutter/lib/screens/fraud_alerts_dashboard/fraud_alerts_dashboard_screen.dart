import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class FraudAlertsDashboardScreen extends ConsumerStatefulWidget {
  const FraudAlertsDashboardScreen({super.key});
  @override
  ConsumerState<FraudAlertsDashboardScreen> createState() => _FraudAlertsDashboardScreenState();
}

class _FraudAlertsDashboardScreenState extends ConsumerState<FraudAlertsDashboardScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  static const _bg = Color(0xFF0F172A);
  static const _card = Color(0xFF1E293B);
  static const _text = Color(0xFFF1F5F9);
  static const _muted = Color(0xFF94A3B8);
  static const _primary = Color(0xFF6366F1);
  static const _border = Color(0xFF334155);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.trpcQuery('fraudAlerts.list');
      final data = result['data'] ?? result;
      setState(() {
        _items = List<Map<String, dynamic>>.from(
          (data['alerts'] ?? data['data'] ?? data['result'] ?? []) as List,
        );
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        title: const Text('Fraud Alerts Dashboard', style: TextStyle(color: _text)),
        backgroundColor: _bg,
        iconTheme: const IconThemeData(color: _text),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: _text),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? Center(child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 48),
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: _muted), textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _load, child: const Text('Retry')),
                  ],
                ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? const Center(child: Text('No data available', style: TextStyle(color: _muted)))
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _items.length,
                          itemBuilder: (context, index) {
                            final item = _items[index];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              decoration: BoxDecoration(
                                color: _card,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: _border),
                              ),
                              child: ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                title: Text(
                                  (alert['type'] ?? alert['alertType'] ?? 'Alert').toString(),
                                  style: const TextStyle(color: _text, fontWeight: FontWeight.w600),
                                ),
                                subtitle: Text(
                                  (alert['severity'] ?? 'medium').toString(),
                                  style: const TextStyle(color: _muted, fontSize: 12),
                                ),
                                trailing: const Icon(Icons.chevron_right, color: _muted),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
