import '../../services/api_service.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class QRPaymentsScreen extends StatefulWidget {
  const QRPaymentsScreen({super.key});
  @override State<QRPaymentsScreen> createState() => _QRPaymentsScreenState();
}

class _QRPaymentsScreenState extends State<QRPaymentsScreen> {
  List<dynamic> _qrCodes = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final r = await http.get(Uri.parse('https://api.paygate.africa/api/trpc/qrPayments.list?input={"limit":50}'));
      final d = jsonDecode(r.body);
      setState(() { _qrCodes = d['result']?['data']?['items'] ?? []; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _generate() async {
    try {
      await http.post(
        Uri.parse('https://api.paygate.africa/api/trpc/qrPayments.generate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'json': {'amount': 1000, 'currency': 'NGN', 'description': 'Flutter QR Payment'}}),
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('QR code generated!')));
      _load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to generate QR code')));
    }
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('QR Payments'), backgroundColor: const Color(0xFF1e293b),
        actions: [IconButton(icon: const Icon(Icons.add), onPressed: _generate, tooltip: 'Generate QR')],
      ),
      body: _loading ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))) :
        _qrCodes.isEmpty ? const Center(child: Text('No QR codes yet. Tap + to generate.', style: TextStyle(color: Color(0xFF64748b)))) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _qrCodes.length,
          itemBuilder: (ctx, i) {
            final item = _qrCodes[i];
            return Card(color: const Color(0xFF1e293b), margin: const EdgeInsets.only(bottom: 12), child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['qrCode'] ?? item['id'] ?? '', style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 12, fontFamily: 'monospace')),
                const SizedBox(height: 4),
                Text('₦${item['amount'] ?? 0}', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(item['status'] ?? 'active', style: const TextStyle(color: Color(0xFF6366f1), fontSize: 13)),
              ]),
            ));
          },
        ),
    );
  }
}
