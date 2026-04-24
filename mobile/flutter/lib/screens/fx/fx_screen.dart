import 'package:flutter/material.dart';

class FXScreen extends StatefulWidget {
  const FXScreen({super.key});
  @override
  State<FXScreen> createState() => _FXScreenState();
}

class _FXScreenState extends State<FXScreen> {
  final _amountController = TextEditingController();
  
  final _pairs = [
    {'pair': 'USD/NGN', 'rate': 1580.50, 'change': 0.32},
    {'pair': 'EUR/NGN', 'rate': 1720.25, 'change': -0.15},
    {'pair': 'GBP/NGN', 'rate': 2010.75, 'change': 0.48},
    {'pair': 'CNY/NGN', 'rate': 217.80, 'change': 0.12},
    {'pair': 'INR/NGN', 'rate': 18.95, 'change': -0.08},
    {'pair': 'BRL/NGN', 'rate': 282.40, 'change': 0.22},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('FX Dashboard'), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Quick Convert', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      hintText: 'Amount (USD)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      suffixText: 'USD',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(8)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Result:', style: TextStyle(color: Colors.grey)),
                        Text(
                          _amountController.text.isEmpty ? '0.00 NGN' : '${(double.tryParse(_amountController.text) ?? 0) * 1580.50} NGN',
                          style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8), fontSize: 16),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Live Rates', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          ..._pairs.map((p) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            child: ListTile(
              title: Text(p['pair'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('Rate: ${p['rate']}'),
              trailing: Text(
                '${(p['change'] as double) >= 0 ? '+' : ''}${p['change']}%',
                style: TextStyle(
                  color: (p['change'] as double) >= 0 ? Colors.green : Colors.red,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          )),
        ],
      ),
    );
  }
}
