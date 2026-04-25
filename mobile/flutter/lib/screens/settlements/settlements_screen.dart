import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class SettlementsScreen extends StatefulWidget {
  const SettlementsScreen({super.key});
  @override State<SettlementsScreen> createState() => _SettlementsScreenState();
}

class _SettlementsScreenState extends State<SettlementsScreen> {
  List<dynamic> _settlements = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final r = await http.get(Uri.parse('https://paygate.manus.space/api/trpc/settlements.list?input={"limit":50}'));
      final d = jsonDecode(r.body);
      setState(() { _settlements = d['result']?['data']?['items'] ?? []; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Color _statusColor(String? s) {
    if (s == 'completed') return Colors.green;
    if (s == 'failed') return Colors.red;
    return Colors.orange;
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(title: const Text('Settlements'), backgroundColor: const Color(0xFF1e293b)),
      body: _loading ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _settlements.length,
          itemBuilder: (ctx, i) {
            final item = _settlements[i];
            final status = item['status'] ?? 'pending';
            final amount = double.tryParse(item['amount']?.toString() ?? '0') ?? 0;
            return Card(color: const Color(0xFF1e293b), margin: const EdgeInsets.only(bottom: 12), child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['reference'] ?? item['id'] ?? '', style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 12, fontFamily: 'monospace')),
                const SizedBox(height: 4),
                Text('₦${amount.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: _statusColor(status).withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                  child: Text(status.toUpperCase(), style: TextStyle(color: _statusColor(status), fontSize: 11, fontWeight: FontWeight.w700))),
              ]),
            ));
          },
        ),
    );
  }
}
