import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class BillingEngineScreen extends StatefulWidget {
  const BillingEngineScreen({super.key});
  @override
  State<BillingEngineScreen> createState() => _BillingEngineScreenState();
}

class _BillingEngineScreenState extends State<BillingEngineScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _events = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/billing.listBillingEvents');
      setState(() { _events = data['result']['data']['events'] ?? []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Billing Engine')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : ListView.builder(
                  itemCount: _events.length,
                  itemBuilder: (ctx, i) {
                    final ev = _events[i];
                    return ListTile(
                      leading: const Icon(Icons.receipt_long),
                      title: Text(ev['eventType']?.toString() ?? 'Event'),
                      subtitle: Text(ev['merchantId']?.toString() ?? ''),
                      trailing: Text(ev['amount']?.toString() ?? '0'),
                    );
                  },
                ),
    );
  }
}
