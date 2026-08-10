import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AdminFraudOversightScreen extends StatefulWidget {
  const AdminFraudOversightScreen({super.key});
  @override
  State<AdminFraudOversightScreen> createState() => _AdminFraudOversightScreenState();
}

class _AdminFraudOversightScreenState extends State<AdminFraudOversightScreen> {
  final ApiService _api = ApiService();
  Map<String, dynamic>? _overview;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/fraudRuleEngine.list');
      setState(() { _overview = data['result']['data']; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fraud Oversight')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Platform Fraud Overview', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 16),
                      if (_overview != null) ...[
                        ListTile(
                          title: const Text('Active Rules'),
                          trailing: Text(_overview!['total']?.toString() ?? '0',
                              style: const TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }
}
