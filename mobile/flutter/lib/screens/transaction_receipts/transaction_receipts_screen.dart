import 'package:flutter/material.dart';

class TransactionReceiptsScreen extends StatelessWidget {
  const TransactionReceiptsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final receipts = [
      {'receiptNumber': 'RCP-2025-000001', 'amount': '₦50,000', 'email': 'customer@example.com'},
      {'receiptNumber': 'RCP-2025-000002', 'amount': '₦75,000', 'email': 'buyer@example.com'},
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction Receipts')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: receipts.length,
        itemBuilder: (context, index) {
          final r = receipts[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const Icon(Icons.receipt_long, color: Colors.blue),
              title: Text(r['receiptNumber']!),
              subtitle: Text(r['email']!),
              trailing: Text(r['amount']!, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
          );
        },
      ),
    );
  }
}
