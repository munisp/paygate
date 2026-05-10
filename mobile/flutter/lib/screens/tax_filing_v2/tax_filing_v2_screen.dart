import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class TaxFilingV2Screen extends StatefulWidget {
  const TaxFilingV2Screen({super.key});
  @override
  State<TaxFilingV2Screen> createState() => _TaxFilingV2ScreenState();
}

class _TaxFilingV2ScreenState extends State<TaxFilingV2Screen> {
  List<dynamic> _filings = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadFilings(); }

  Future<void> _loadFilings() async {
    setState(() => _loading = true);
    try {
      final resp = await http.get(Uri.parse('/api/trpc/taxFilingV2.listFilings?input=%7B%22page%22%3A1%7D'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        setState(() { _filings = data['result']?['data']?['filings'] ?? []; });
      }
    } finally { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tax Filing V2'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loadFilings)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) :
        _filings.isEmpty ? const Center(child: Text('No tax filings')) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _filings.length,
          itemBuilder: (ctx, i) {
            final f = _filings[i];
            return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              leading: const Icon(Icons.receipt_long),
              title: Text(f['taxType'] ?? 'Tax Filing'),
              subtitle: Text('Period: ${f['taxPeriod'] ?? 'N/A'} · ₦${f['taxableAmount'] ?? 0}'),
              trailing: Chip(label: Text(f['status'] ?? 'pending'),
                backgroundColor: f['status'] == 'filed' ? Colors.green[100] : Colors.orange[100]),
            ));
          },
        ),
      floatingActionButton: FloatingActionButton(onPressed: () {}, child: const Icon(Icons.add)),
    );
  }
}
