import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class SubscriptionsScreen extends StatefulWidget {
  const SubscriptionsScreen({super.key});
  @override
  State<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends State<SubscriptionsScreen> {
  List<dynamic> _items = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String? _statusFilter;

  static const _statusColors = {
    'active': Color(0xFF10B981),
    'trialing': Color(0xFF3B82F6),
    'past_due': Color(0xFFF59E0B),
    'cancelled': Color(0xFFEF4444),
    'paused': Color(0xFF8B5CF6),
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final input = jsonEncode({'limit': 20, 'offset': 0, if (_statusFilter != null) 'status': _statusFilter});
      final res = await http.get(
        Uri.parse('/api/trpc/subscriptions.list?input=${Uri.encodeComponent(input)}'),
        headers: {'Content-Type': 'application/json'},
      );
      final statsRes = await http.get(Uri.parse('/api/trpc/subscriptions.stats'), headers: {'Content-Type': 'application/json'});
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final statsData = statsRes.statusCode == 200 ? jsonDecode(statsRes.body) : null;
        setState(() {
          _items = data['result']?['data']?['rows'] ?? [];
          _stats = statsData?['result']?['data'];
          _loading = false;
        });
      } else {
        setState(() { _error = 'Failed to load subscriptions'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _cancelSubscription(String id) async {
    await http.post(
      Uri.parse('/api/trpc/subscriptions.cancel'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'json': {'id': id}}),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Subscriptions'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          if (_stats != null) _buildStats(),
          _buildFilters(),
          Expanded(child: _buildList()),
        ],
      ),
    );
  }

  Widget _buildStats() {
    return Container(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          _statCard('Active', '${_stats!['active'] ?? 0}', const Color(0xFF10B981)),
          const SizedBox(width: 8),
          _statCard('Trial', '${_stats!['trialing'] ?? 0}', const Color(0xFF3B82F6)),
          const SizedBox(width: 8),
          _statCard('Past Due', '${_stats!['pastDue'] ?? 0}', const Color(0xFFF59E0B)),
          const SizedBox(width: 8),
          _statCard('Cancelled', '${_stats!['cancelled'] ?? 0}', const Color(0xFFEF4444)),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border(left: BorderSide(color: color, width: 3)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4)],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    final filters = [null, 'active', 'trialing', 'past_due', 'cancelled', 'paused'];
    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: filters.length,
        itemBuilder: (ctx, i) {
          final f = filters[i];
          final active = _statusFilter == f;
          return GestureDetector(
            onTap: () { setState(() { _statusFilter = f; }); _load(); },
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: BoxDecoration(
                color: active ? const Color(0xFF6366F1) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: active ? const Color(0xFF6366F1) : const Color(0xFFE2E8F0)),
              ),
              child: Text(f ?? 'All', style: TextStyle(fontSize: 13, color: active ? Colors.white : const Color(0xFF64748B), fontWeight: active ? FontWeight.w600 : FontWeight.normal)),
            ),
          );
        },
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_error != null) return Center(child: Text(_error!, style: const TextStyle(color: Color(0xFFEF4444))));
    if (_items.isEmpty) return const Center(child: Text('No subscriptions found', style: TextStyle(color: Color(0xFF94A3B8))));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
        itemCount: _items.length,
        itemBuilder: (ctx, i) => _buildCard(_items[i]),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> item) {
    final status = item['status'] as String? ?? 'active';
    final color = _statusColors[status] ?? const Color(0xFF94A3B8);
    final amountKobo = (item['amountKobo'] as num?)?.toDouble() ?? 0;
    final cancelAtPeriodEnd = item['cancelAtPeriodEnd'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 6)],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item['planName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    Text('${item['planCode'] ?? ''} · ${item['billingCycle'] ?? ''}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
                  ],
                )),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: Text(status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('₦${(amountKobo / 100).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const Text('Amount', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ])),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item['currentPeriodEnd'] != null ? item['currentPeriodEnd'].toString().substring(0, 10) : '-', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const Text('Renews', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ])),
              ],
            ),
            if (cancelAtPeriodEnd) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(6)),
                child: const Text('⚠️ Cancels at period end', style: TextStyle(fontSize: 12, color: Color(0xFF92400E))),
              ),
            ],
            if (status == 'active' && !cancelAtPeriodEnd) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFEF4444), side: const BorderSide(color: Color(0xFFEF4444))),
                  onPressed: () => showDialog(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Cancel Subscription'),
                      content: const Text('Cancel at period end?'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('No')),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
                          onPressed: () { Navigator.pop(ctx); _cancelSubscription(item['id']); },
                          child: const Text('Yes, Cancel', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                  child: const Text('Cancel Subscription'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
