import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AMLMonitorScreen extends StatefulWidget {
  const AMLMonitorScreen({super.key});
  @override
  State<AMLMonitorScreen> createState() => _AMLMonitorScreenState();
}

class _AMLMonitorScreenState extends State<AMLMonitorScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _alerts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/compliance.getAMLAlerts');
      setState(() { _alerts = data['result']['data'] ?? []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AML Monitor')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : ListView.builder(
                  itemCount: _alerts.length,
                  itemBuilder: (ctx, i) {
                    final alert = _alerts[i];
                    return ListTile(
                      leading: const Icon(Icons.warning_amber, color: Colors.orange),
                      title: Text(alert['type']?.toString() ?? 'Alert'),
                      subtitle: Text(alert['description']?.toString() ?? ''),
                      trailing: Chip(label: Text(alert['status']?.toString() ?? 'open')),
                    );
                  },
                ),
    );
  }
}
