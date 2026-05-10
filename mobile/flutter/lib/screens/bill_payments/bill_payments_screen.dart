import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class BillPaymentsScreen extends StatefulWidget {
  const BillPaymentsScreen({super.key});
  @override
  State<BillPaymentsScreen> createState() => _BillPaymentsScreenState();
}

class _BillPaymentsScreenState extends State<BillPaymentsScreen> {
  List<dynamic> _items = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String? _statusFilter;

  static const _statusColors = {
    'pending': Color(0xFFF59E0B),
    'processing': Color(0xFF3B82F6),
    'completed': Color(0xFF10B981),
    'failed': Color(0xFFEF4444),
  };

  static const _categoryIcons = {
    'electricity': Icons.bolt,
    'water': Icons.water_drop,
    'cable_tv': Icons.tv,
    'internet': Icons.wifi,
    'airtime': Icons.phone_android,
    'data': Icons.signal_cellular_alt,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final params = _statusFilter != null ? '?status=$_statusFilter' : '';
      final res = await http.get(
        Uri.parse('/api/trpc/billPayments.list?input=${Uri.encodeComponent(jsonEncode({"limit": 20, "offset": 0, if (_statusFilter != null) "status": _statusFilter}))}'),
        headers: {'Content-Type': 'application/json'},
      );
      final statsRes = await http.get(
        Uri.parse('/api/trpc/billPayments.stats'),
        headers: {'Content-Type': 'application/json'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final statsData = statsRes.statusCode == 200 ? jsonDecode(statsRes.body) : null;
        setState(() {
          _items = data['result']?['data']?['rows'] ?? [];
          _stats = statsData?['result']?['data'];
          _loading = false;
        });
      } else {
        setState(() { _error = 'Failed to load bill payments'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Bill Payments'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: Column(
        children: [
          if (_stats != null) _buildStats(),
          _buildFilters(),
          Expanded(child: _buildList()),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFF6366F1),
        onPressed: () => _showCreateDialog(context),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildStats() {
    return Container(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          _statCard('Total', '${_stats!['total'] ?? 0}', const Color(0xFF6366F1)),
          const SizedBox(width: 8),
          _statCard('Done', '${_stats!['completed'] ?? 0}', const Color(0xFF10B981)),
          const SizedBox(width: 8),
          _statCard('Pending', '${_stats!['pending'] ?? 0}', const Color(0xFFF59E0B)),
          const SizedBox(width: 8),
          _statCard('Failed', '${_stats!['failed'] ?? 0}', const Color(0xFFEF4444)),
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
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color)),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    final filters = [null, 'pending', 'processing', 'completed', 'failed'];
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
              child: Text(
                f ?? 'All',
                style: TextStyle(
                  fontSize: 13,
                  color: active ? Colors.white : const Color(0xFF64748B),
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_error != null) return Center(child: Text(_error!, style: const TextStyle(color: Color(0xFFEF4444))));
    if (_items.isEmpty) return const Center(child: Text('No bill payments found', style: TextStyle(color: Color(0xFF94A3B8))));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 100),
        itemCount: _items.length,
        itemBuilder: (ctx, i) => _buildCard(_items[i]),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> item) {
    final status = item['status'] as String? ?? 'pending';
    final color = _statusColors[status] ?? const Color(0xFF94A3B8);
    final category = item['category'] as String? ?? '';
    final icon = _categoryIcons[category] ?? Icons.receipt;
    final amountKobo = (item['amountKobo'] as num?)?.toDouble() ?? 0;
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
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
                  child: Icon(icon, size: 20, color: const Color(0xFF6366F1)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item['billerName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      Text(item['customerReference'] ?? '', style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: Text(status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('₦${(amountKobo / 100).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                Text(item['createdAt'] != null ? item['createdAt'].toString().substring(0, 10) : '', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final billerCodeCtrl = TextEditingController();
    final billerNameCtrl = TextEditingController();
    final refCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    String category = 'electricity';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 16, right: 16, top: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('New Bill Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              TextField(controller: billerCodeCtrl, decoration: const InputDecoration(labelText: 'Biller Code', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: billerNameCtrl, decoration: const InputDecoration(labelText: 'Biller Name', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: refCtrl, decoration: const InputDecoration(labelText: 'Customer Reference', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: amountCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (₦)', border: OutlineInputBorder())),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    await http.post(
                      Uri.parse('/api/trpc/billPayments.create'),
                      headers: {'Content-Type': 'application/json'},
                      body: jsonEncode({'json': {
                        'userId': 1, 'walletId': 'default', 'category': category,
                        'billerCode': billerCodeCtrl.text, 'billerName': billerNameCtrl.text,
                        'customerReference': refCtrl.text,
                        'amountKobo': (double.tryParse(amountCtrl.text) ?? 0) * 100,
                        'currency': 'NGN',
                      }}),
                    );
                    _load();
                  },
                  child: const Text('Create Bill Payment'),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
