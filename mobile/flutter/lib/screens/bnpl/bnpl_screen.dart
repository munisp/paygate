import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class BNPLScreen extends ConsumerStatefulWidget {
  const BNPLScreen({super.key});
  @override
  ConsumerState<BNPLScreen> createState() => _BNPLScreenState();
}

class _BNPLScreenState extends ConsumerState<BNPLScreen> {
  List<dynamic> _plans = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadPlans();
  }

  Future<void> _loadPlans() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.listBnplPlans(
        status: _statusFilter == 'all' ? null : _statusFilter,
      );
      final rows = result['rows'] ?? result['plans'] ?? result['data'] ?? [];
      setState(() { _plans = rows is List ? rows : []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'active': return Colors.blue;
      case 'completed': return Colors.green;
      case 'defaulted': return Colors.red;
      case 'pending': return Colors.orange;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('BNPL Plans'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadPlans),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          Padding(
            padding: const EdgeInsets.all(12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ['all', 'active', 'completed', 'defaulted', 'pending'].map((s) =>
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(s[0].toUpperCase() + s.substring(1)),
                      selected: _statusFilter == s,
                      onSelected: (_) { setState(() => _statusFilter = s); _loadPlans(); },
                    ),
                  ),
                ).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                ? Center(child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      ElevatedButton(onPressed: _loadPlans, child: const Text('Retry')),
                    ],
                  ))
                : _plans.isEmpty
                  ? const Center(child: Text('No BNPL plans found'))
                  : RefreshIndicator(
                      onRefresh: _loadPlans,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _plans.length,
                        itemBuilder: (ctx, i) {
                          final p = _plans[i];
                          final status = p['status'] as String? ?? 'unknown';
                          final paid = (p['installments_paid'] ?? p['paid'] ?? 0) as int;
                          final total = (p['total_installments'] ?? p['installments'] ?? 1) as int;
                          final amount = (p['amount'] ?? 0.0) as num;
                          final currency = p['currency'] ?? 'NGN';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(p['plan_id'] ?? p['id']?.toString() ?? 'N/A',
                                        style: const TextStyle(fontWeight: FontWeight.bold)),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _statusColor(status).withOpacity(0.15),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(status, style: TextStyle(color: _statusColor(status), fontSize: 12)),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Text('${p['customer_name'] ?? p['customer_email'] ?? 'Customer'}',
                                    style: const TextStyle(color: Colors.grey)),
                                  const SizedBox(height: 4),
                                  Text('$currency ${amount.toStringAsFixed(2)}',
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  LinearProgressIndicator(
                                    value: total > 0 ? paid / total : 0,
                                    backgroundColor: Colors.grey[200],
                                    color: _statusColor(status),
                                  ),
                                  const SizedBox(height: 4),
                                  Text('$paid / $total installments paid',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                ],
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
}
