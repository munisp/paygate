import 'package:flutter/material.dart';

class FraudRiskScreen extends StatefulWidget {
  const FraudRiskScreen({super.key});
  @override
  State<FraudRiskScreen> createState() => _FraudRiskScreenState();
}

class _FraudRiskScreenState extends State<FraudRiskScreen> {
  String _filter = 'all';
  final _alerts = [
    {'id': 'FA-001', 'txnId': 'TXN-9001', 'riskScore': 92, 'reason': 'Velocity anomaly', 'status': 'open', 'severity': 'critical', 'amount': 5000.0, 'currency': 'NGN'},
    {'id': 'FA-002', 'txnId': 'TXN-9002', 'riskScore': 78, 'reason': 'Geo mismatch', 'status': 'reviewing', 'severity': 'high', 'amount': 12000.0, 'currency': 'NGN'},
    {'id': 'FA-003', 'txnId': 'TXN-9003', 'riskScore': 55, 'reason': 'Device fingerprint change', 'status': 'resolved', 'severity': 'medium', 'amount': 3000.0, 'currency': 'NGN'},
  ];

  Color _severityColor(String s) {
    switch (s) {
      case 'critical': return Colors.red;
      case 'high': return Colors.orange;
      case 'medium': return Colors.amber;
      default: return Colors.green;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filter == 'all' ? _alerts : _alerts.where((a) => a['severity'] == _filter).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Fraud & Risk'), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: ['all', 'critical', 'high', 'medium'].map((f) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(f, style: const TextStyle(fontSize: 12)),
                  selected: _filter == f,
                  onSelected: (_) => setState(() => _filter = f),
                  selectedColor: const Color(0xFF6366F1),
                  labelStyle: TextStyle(color: _filter == f ? Colors.white : null),
                ),
              )).toList(),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: filtered.length,
              itemBuilder: (ctx, i) {
                final a = filtered[i];
                final color = _severityColor(a['severity'] as String);
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
                            Text(a['id'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                              child: Text(a['severity'] as String, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 11)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(a['txnId'] as String, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        Text(a['reason'] as String, style: const TextStyle(fontSize: 12)),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Risk Score: ${a['riskScore']}', style: TextStyle(color: color, fontWeight: FontWeight.w700)),
                            Text('${(a['amount'] as double).toStringAsFixed(0)} ${a['currency']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
