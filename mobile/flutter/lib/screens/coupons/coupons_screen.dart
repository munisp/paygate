import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class CouponsScreen extends StatefulWidget {
  const CouponsScreen({super.key});
  @override
  State<CouponsScreen> createState() => _CouponsScreenState();
}

class _CouponsScreenState extends State<CouponsScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;

  static const _typeColors = {
    'percentage': Color(0xFF6366F1),
    'fixed_amount': Color(0xFF10B981),
    'free_shipping': Color(0xFF3B82F6),
    'buy_x_get_y': Color(0xFFF59E0B),
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await http.get(
        Uri.parse('/api/trpc/coupons.list?input=${Uri.encodeComponent(jsonEncode({"limit": 20, "offset": 0}))}'),
        headers: {'Content-Type': 'application/json'},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() { _items = data['result']?['data']?['rows'] ?? []; _loading = false; });
      } else {
        setState(() { _error = 'Failed to load coupons'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _deactivate(String id) async {
    await http.post(
      Uri.parse('/api/trpc/coupons.deactivate'),
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
        title: const Text('Coupons'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Color(0xFFEF4444))))
              : _items.isEmpty
                  ? const Center(child: Text('No coupons found', style: TextStyle(color: Color(0xFF94A3B8))))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                        itemCount: _items.length,
                        itemBuilder: (ctx, i) => _buildCard(_items[i]),
                      ),
                    ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFF6366F1),
        onPressed: () => _showCreateDialog(context),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> item) {
    final discountType = item['discountType'] as String? ?? 'percentage';
    final color = _typeColors[discountType] ?? const Color(0xFF6366F1);
    final isActive = item['isActive'] == true;
    final usageCount = (item['usageCount'] as num?)?.toInt() ?? 0;
    final maxUsage = item['maxUsage'];
    final discountValue = (item['discountValue'] as num?)?.toDouble() ?? 0;
    return Opacity(
      opacity: isActive ? 1.0 : 0.6,
      child: Container(
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
                children: [
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: item['code'] ?? ''));
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied!')));
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(6)),
                      child: Row(
                        children: [
                          Text(item['code'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: 1.5)),
                          const SizedBox(width: 6),
                          const Icon(Icons.copy, size: 14, color: Color(0xFF94A3B8)),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                    child: Text(discountType.replaceAll('_', ' '), style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(discountType == 'percentage' ? '$discountValue%' : '₦$discountValue', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const Text('Discount', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                  ])),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('$usageCount / ${maxUsage ?? '∞'}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const Text('Used', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                  ])),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(isActive ? 'Active' : 'Inactive', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: isActive ? const Color(0xFF10B981) : const Color(0xFFEF4444))),
                    const Text('Status', style: TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                  ])),
                ],
              ),
              if (isActive) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFEF4444), side: const BorderSide(color: Color(0xFFEF4444))),
                    onPressed: () => showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Deactivate Coupon'),
                        content: Text('Deactivate coupon ${item['code']}?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
                            onPressed: () { Navigator.pop(ctx); _deactivate(item['id']); },
                            child: const Text('Deactivate', style: TextStyle(color: Colors.white)),
                          ),
                        ],
                      ),
                    ),
                    child: const Text('Deactivate'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final codeCtrl = TextEditingController();
    final valueCtrl = TextEditingController();
    final maxUsageCtrl = TextEditingController();
    String discountType = 'percentage';
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
              const Text('Create Coupon', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              TextField(
                controller: codeCtrl,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Coupon Code', hintText: 'SUMMER20', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 8),
              const Text('Discount Type', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                children: ['percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y'].map((t) => ChoiceChip(
                  label: Text(t.replaceAll('_', ' ')),
                  selected: discountType == t,
                  onSelected: (_) => setModalState(() { discountType = t; }),
                  selectedColor: const Color(0xFF6366F1),
                  labelStyle: TextStyle(color: discountType == t ? Colors.white : null),
                )).toList(),
              ),
              const SizedBox(height: 8),
              TextField(controller: valueCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: discountType == 'percentage' ? 'Discount %' : 'Discount Amount (₦)', border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: maxUsageCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Max Usage (optional)', border: OutlineInputBorder())),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                  onPressed: () async {
                    Navigator.pop(ctx);
                    await http.post(
                      Uri.parse('/api/trpc/coupons.create'),
                      headers: {'Content-Type': 'application/json'},
                      body: jsonEncode({'json': {
                        'code': codeCtrl.text.toUpperCase(),
                        'discountType': discountType,
                        'discountValue': double.tryParse(valueCtrl.text) ?? 0,
                        if (maxUsageCtrl.text.isNotEmpty) 'maxUsage': int.tryParse(maxUsageCtrl.text),
                      }}),
                    );
                    _load();
                  },
                  child: const Text('Create Coupon'),
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
