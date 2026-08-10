import '../../services/api_service.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class ComplianceScreen extends StatefulWidget {
  const ComplianceScreen({super.key});
  @override State<ComplianceScreen> createState() => _ComplianceScreenState();
}

class _ComplianceScreenState extends State<ComplianceScreen> {
  List<dynamic> _records = [];
  bool _loading = true;
  String _search = '';
  final _searchCtrl = TextEditingController();

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final r = await http.get(
        Uri.parse('https://api.paygate.africa/api/trpc/complianceKyc.list?input={"limit":50}'),
        headers: {'Content-Type': 'application/json'},
      );
      final d = jsonDecode(r.body);
      setState(() { _records = d['result']?['data']?['items'] ?? []; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Color _statusColor(String? s) {
    if (s == 'approved') return Colors.green;
    if (s == 'rejected') return Colors.red;
    return Colors.orange;
  }

  @override Widget build(BuildContext context) {
    final filtered = _records.where((r) =>
      (r['customerName'] ?? '').toLowerCase().contains(_search.toLowerCase()) ||
      (r['status'] ?? '').toLowerCase().contains(_search.toLowerCase())
    ).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(title: const Text('Compliance & KYC'), backgroundColor: const Color(0xFF1e293b)),
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(16), child: TextField(
          controller: _searchCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Search customers...', hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
            filled: true, fillColor: const Color(0xFF1e293b), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
            prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
          ),
          onChanged: (v) => setState(() => _search = v),
        )),
        Expanded(child: _loading ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))) :
          ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: filtered.length,
            itemBuilder: (ctx, i) {
              final item = filtered[i];
              final status = item['status'] ?? 'pending';
              return Card(color: const Color(0xFF1e293b), margin: const EdgeInsets.only(bottom: 12), child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item['customerName'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(item['email'] ?? '', style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 13)),
                  const SizedBox(height: 8),
                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: _statusColor(status).withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                    child: Text(status.toUpperCase(), style: TextStyle(color: _statusColor(status), fontSize: 11, fontWeight: FontWeight.w700))),
                ]),
              ));
            },
          ),
        ),
      ]),
    );
  }
}
