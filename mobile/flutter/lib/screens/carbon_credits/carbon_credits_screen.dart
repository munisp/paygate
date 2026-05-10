import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class CarbonCreditsScreen extends StatefulWidget {
  const CarbonCreditsScreen({super.key});
  @override
  State<CarbonCreditsScreen> createState() => _CarbonCreditsScreenState();
}

class _CarbonCreditsScreenState extends State<CarbonCreditsScreen> {
  List<dynamic> _items = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String? _statusFilter;

  static const _statusColors = {
    'active': Color(0xFF10B981),
    'retired': Color(0xFF6366F1),
    'pending': Color(0xFFF59E0B),
    'cancelled': Color(0xFFEF4444),
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
        Uri.parse('/api/trpc/carbonCredits.list?input=${Uri.encodeComponent(input)}'),
        headers: {'Content-Type': 'application/json'},
      );
      final statsRes = await http.get(Uri.parse('/api/trpc/carbonCredits.stats'), headers: {'Content-Type': 'application/json'});
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final statsData = statsRes.statusCode == 200 ? jsonDecode(statsRes.body) : null;
        setState(() {
          _items = data['result']?['data']?['rows'] ?? [];
          _stats = statsData?['result']?['data'];
          _loading = false;
        });
      } else {
        setState(() { _error = 'Failed to load carbon credits'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _retireCredits(String id, double qty) async {
    await http.post(
      Uri.parse('/api/trpc/carbonCredits.retire'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'json': {'id': id, 'quantityToRetire': qty}}),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0FDF4),
      appBar: AppBar(
        title: const Text('Carbon Credits'),
        backgroundColor: const Color(0xFF10B981),
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
          _statCard('Tonnes', '${_stats!['totalTonnes'] ?? 0}', const Color(0xFF10B981)),
          const SizedBox(width: 8),
          _statCard('Retired', '${_stats!['retiredTonnes'] ?? 0}', const Color(0xFF6366F1)),
          const SizedBox(width: 8),
          _statCard('Value', '\$${_stats!['portfolioValue'] ?? 0}', const Color(0xFFF59E0B)),
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
    final filters = [null, 'active', 'retired', 'pending', 'cancelled'];
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
                color: active ? const Color(0xFF10B981) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: active ? const Color(0xFF10B981) : const Color(0xFFE2E8F0)),
              ),
              child: Text(f ?? 'All', style: TextStyle(fontSize: 13, color: active ? Colors.white : const Color(0xFF64748B), fontWeight: active ? FontWeight.w600 : FontWeight.normal)),
            ),
          );
        },
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator(color: Color(0xFF10B981)));
    if (_error != null) return Center(child: Text(_error!, style: const TextStyle(color: Color(0xFFEF4444))));
    if (_items.isEmpty) return const Center(child: Text('No carbon credits found', style: TextStyle(color: Color(0xFF94A3B8))));
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
    final qty = (item['quantityTonnes'] as num?)?.toDouble() ?? 0;
    final price = (item['pricePerTonne'] as num?)?.toDouble() ?? 0;
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
                Expanded(child: Text(item['projectName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: Text(status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('${item['registry'] ?? ''} · ${item['vintageYear'] ?? ''}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${qty.toStringAsFixed(0)} tCO₂e', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const Text('Quantity', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ])),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('\$$price/t', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const Text('Price', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ])),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('\$${(qty * price).toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF10B981))),
                  const Text('Total Value', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ])),
              ],
            ),
            if (status == 'active') ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.eco, size: 16),
                  label: const Text('Retire Credits'),
                  style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFF10B981), side: const BorderSide(color: Color(0xFF10B981))),
                  onPressed: () => _showRetireDialog(context, item),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showRetireDialog(BuildContext context, Map<String, dynamic> item) {
    final qtyCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Retire Carbon Credits'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Project: ${item['projectName']}'),
            const SizedBox(height: 8),
            TextField(controller: qtyCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity (tonnes)', border: OutlineInputBorder())),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
            onPressed: () {
              Navigator.pop(ctx);
              _retireCredits(item['id'], double.tryParse(qtyCtrl.text) ?? 0);
            },
            child: const Text('Retire', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
