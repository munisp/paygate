import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class TeamRolesScreen extends StatefulWidget {
  const TeamRolesScreen({super.key});
  @override
  State<TeamRolesScreen> createState() => _TeamRolesScreenState();
}

class _TeamRolesScreenState extends State<TeamRolesScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await http.get(Uri.parse('/api/trpc/team_roles.list'),
        headers: {'Content-Type': 'application/json'});
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() { _items = data['result']?['data'] ?? []; _loading = false; });
      } else {
        setState(() { _error = 'Failed to load data'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Team Roles'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Colors.red),
                    const SizedBox(height: 16),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _load, child: const Text('Retry')),
                  ],
                ))
              : _items.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.inbox_outlined, size: 64, color: Colors.grey),
                          const SizedBox(height: 16),
                          Text('No Team Roles data', style: const TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length,
                        itemBuilder: (ctx, i) {
                          final item = _items[i];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              title: Text(item['name'] ?? item['id'] ?? 'Item ${i + 1}',
                                style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(item['status'] ?? item['description'] ?? ''),
                              trailing: const Icon(Icons.chevron_right),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
