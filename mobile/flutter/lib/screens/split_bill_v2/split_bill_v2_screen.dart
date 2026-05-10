import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class SplitBillV2Screen extends StatefulWidget {
  const SplitBillV2Screen({super.key});
  @override
  State<SplitBillV2Screen> createState() => _SplitBillV2ScreenState();
}

class _SplitBillV2ScreenState extends State<SplitBillV2Screen> {
  List<dynamic> _sessions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadSessions(); }

  Future<void> _loadSessions() async {
    setState(() => _loading = true);
    try {
      final resp = await http.get(Uri.parse('/api/trpc/splitBillV2.listSessions?input=%7B%22page%22%3A1%7D'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        setState(() { _sessions = data['result']?['data']?['sessions'] ?? []; });
      }
    } finally { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Split Bill V2'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loadSessions)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) :
        _sessions.isEmpty ? const Center(child: Text('No split sessions')) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _sessions.length,
          itemBuilder: (ctx, i) {
            final s = _sessions[i];
            return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              leading: const Icon(Icons.group),
              title: Text(s['title'] ?? 'Split Session'),
              subtitle: Text('₦${s['totalAmount'] ?? 0} · ${s['participantCount'] ?? 0} people'),
              trailing: Chip(label: Text(s['status'] ?? 'active'),
                backgroundColor: s['status'] == 'completed' ? Colors.green[100] : Colors.blue[100]),
            ));
          },
        ),
      floatingActionButton: FloatingActionButton(onPressed: () {}, child: const Icon(Icons.add)),
    );
  }
}
