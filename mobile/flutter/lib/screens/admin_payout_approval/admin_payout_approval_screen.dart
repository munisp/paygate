import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AdminPayoutApprovalScreen extends StatefulWidget {
  const AdminPayoutApprovalScreen({super.key});
  @override
  State<AdminPayoutApprovalScreen> createState() => _AdminPayoutApprovalScreenState();
}

class _AdminPayoutApprovalScreenState extends State<AdminPayoutApprovalScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _payouts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/payouts.list');
      setState(() { _payouts = data['result']['data']['payouts'] ?? []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _approve(String payoutId) async {
    try {
      await _api.post('/api/trpc/payouts.approve', {'payoutId': payoutId});
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payout Approval')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : ListView.builder(
                  itemCount: _payouts.length,
                  itemBuilder: (ctx, i) {
                    final payout = _payouts[i];
                    final isPending = payout['status'] == 'pending';
                    return ListTile(
                      leading: const Icon(Icons.payments),
                      title: Text(payout['reference']?.toString() ?? 'Payout'),
                      subtitle: Text('${payout['currency'] ?? ''} ${payout['amount'] ?? 0}'),
                      trailing: isPending
                          ? ElevatedButton(
                              onPressed: () => _approve(payout['id'].toString()),
                              child: const Text('Approve'),
                            )
                          : Chip(label: Text(payout['status']?.toString() ?? '')),
                    );
                  },
                ),
    );
  }
}
