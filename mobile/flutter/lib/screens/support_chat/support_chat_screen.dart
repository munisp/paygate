import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class SupportChatScreen extends StatefulWidget {
  const SupportChatScreen({super.key});
  @override
  State<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends State<SupportChatScreen> {
  List<dynamic> _sessions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _loadSessions(); }

  Future<void> _loadSessions() async {
    setState(() => _loading = true);
    try {
      final resp = await http.get(Uri.parse('/api/trpc/supportChat.listSessions?input=%7B%22page%22%3A1%7D'));
      if (resp.statusCode == 200) {
        final data = json.decode(resp.body);
        setState(() { _sessions = data['result']?['data']?['sessions'] ?? []; });
      }
    } finally { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support Chat'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _loadSessions)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) :
        _sessions.isEmpty ? const Center(child: Text('No support sessions')) :
        ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _sessions.length,
          itemBuilder: (ctx, i) {
            final s = _sessions[i];
            return Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(
              leading: const Icon(Icons.chat_bubble),
              title: Text(s['subject'] ?? 'Support Session'),
              subtitle: Text(s['merchantId'] ?? ''),
              trailing: Chip(label: Text(s['status'] ?? 'open'),
                backgroundColor: s['status'] == 'resolved' ? Colors.green[100] : Colors.blue[100]),
            ));
          },
        ),
    );
  }
}
