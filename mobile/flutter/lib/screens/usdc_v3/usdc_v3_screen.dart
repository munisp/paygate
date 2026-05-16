import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class UsdcV3Screen extends StatefulWidget {
  const UsdcV3Screen({super.key});
  @override
  State<UsdcV3Screen> createState() => _UsdcV3ScreenState();
}

class _UsdcV3ScreenState extends State<UsdcV3Screen> {
  List<dynamic> _txns = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadTxns(); }

  Future<void> _loadTxns() async {
    setState(() => _loading = true);
    try {
      final resp = await http.get(Uri.parse('/api/trpc/usdcV3.listTransactions?input=%7B%22page%22%3A1%7D'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        setState(() { _txns = data['result']?['data']?['transactions'] ?? []; });
      }
    } finally { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('USDC V3'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loadTxns)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) :
        _txns.isEmpty ? const Center(child: Text('No USDC transactions')) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _txns.length,
          itemBuilder: (ctx, i) {
            final t = _txns[i];
            return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              leading: const Icon(Icons.currency_exchange),
              title: Text('\$${t['amount'] ?? 0} USDC'),
              subtitle: Text(t['walletAddress'] ?? t['id'] ?? ''),
              trailing: Chip(label: Text(t['status'] ?? 'pending'),
                backgroundColor: t['status'] == 'confirmed' ? Colors.green[100] : Colors.orange[100]),
            ));
          },
        ),
    );
  }
}
