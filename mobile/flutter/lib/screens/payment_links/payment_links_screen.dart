import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PaymentLinksScreen extends StatelessWidget {
  const PaymentLinksScreen({super.key});

  final _links = const [
    {'id': 'PL-001', 'title': 'Invoice #INV-2026-001', 'amount': 50000.0, 'currency': 'NGN', 'status': 'active', 'clicks': 12, 'payments': 3},
    {'id': 'PL-002', 'title': 'Product Bundle', 'amount': 25000.0, 'currency': 'NGN', 'status': 'active', 'clicks': 45, 'payments': 18},
    {'id': 'PL-003', 'title': 'Event Registration', 'amount': 10000.0, 'currency': 'NGN', 'status': 'expired', 'clicks': 200, 'payments': 87},
  ];

  Color _statusColor(String s) => s == 'active' ? Colors.green : s == 'expired' ? Colors.red : Colors.orange;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment Links'), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _links.length,
        itemBuilder: (ctx, i) {
          final l = _links[i];
          final url = 'https://pay.paygate.ng/${l['id']}';
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text(l['title'] as String, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: _statusColor(l['status'] as String).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                        child: Text(l['status'] as String, style: TextStyle(color: _statusColor(l['status'] as String), fontWeight: FontWeight.w600, fontSize: 11)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('${(l['amount'] as double).toStringAsFixed(0)} ${l['currency']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                  const SizedBox(height: 6),
                  Row(children: [
                    const Icon(Icons.visibility, size: 14, color: Colors.grey),
                    Text(' ${l['clicks']} views  ', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    const Icon(Icons.payment, size: 14, color: Colors.grey),
                    Text(' ${l['payments']} paid', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () { Clipboard.setData(ClipboardData(text: url)); ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Copied: $url'))); },
                        icon: const Icon(Icons.copy, size: 16),
                        label: const Text('Copy Link'),
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Create link coming soon'))),
        label: const Text('Create Link'),
        icon: const Icon(Icons.add_link),
        backgroundColor: const Color(0xFF6366F1),
      ),
    );
  }
}
