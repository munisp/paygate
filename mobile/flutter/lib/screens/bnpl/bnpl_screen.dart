import 'package:flutter/material.dart';

class BNPLScreen extends StatelessWidget {
  const BNPLScreen({super.key});

  final _plans = const [
    {'id': 'BNPL-001', 'customer': 'Adaeze Okonkwo', 'amount': 45000.0, 'currency': 'NGN', 'installments': 3, 'paid': 1, 'status': 'active'},
    {'id': 'BNPL-002', 'customer': 'Emeka Nwosu', 'amount': 120000.0, 'currency': 'NGN', 'installments': 6, 'paid': 3, 'status': 'active'},
    {'id': 'BNPL-003', 'customer': 'Fatima Aliyu', 'amount': 30000.0, 'currency': 'NGN', 'installments': 3, 'paid': 3, 'status': 'completed'},
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'active': return Colors.blue;
      case 'completed': return Colors.green;
      case 'defaulted': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('BNPL Plans'), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _plans.length,
        itemBuilder: (ctx, i) {
          final p = _plans[i];
          final color = _statusColor(p['status'] as String);
          final progress = (p['paid'] as int) / (p['installments'] as int);
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
                      Text(p['id'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                        child: Text(p['status'] as String, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 11)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(p['customer'] as String, style: const TextStyle(color: Colors.grey)),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: progress, backgroundColor: Colors.grey[200], valueColor: AlwaysStoppedAnimation(color)),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('${p['paid']}/${p['installments']} installments', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('${(p['amount'] as double).toStringAsFixed(0)} ${p['currency']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('New BNPL plan coming soon'))),
        label: const Text('New Plan'),
        icon: const Icon(Icons.add),
        backgroundColor: const Color(0xFF6366F1),
      ),
    );
  }
}
