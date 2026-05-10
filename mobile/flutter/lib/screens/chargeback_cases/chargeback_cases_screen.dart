import 'package:flutter/material.dart';

class ChargebackCasesScreen extends StatefulWidget {
  const ChargebackCasesScreen({super.key});
  @override
  State<ChargebackCasesScreen> createState() => _ChargebackCasesScreenState();
}

class _ChargebackCasesScreenState extends State<ChargebackCasesScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    await Future.delayed(const Duration(milliseconds: 600));
    setState(() {
      _loading = false;
      _items = List.generate(5, (i) => {'id': 'item-$i', 'label': 'ChargebackCases #$i', 'status': i % 2 == 0 ? 'active' : 'pending'});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ChargebackCases'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadData),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(child: Text('No items found'))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _items.length,
                  itemBuilder: (ctx, i) {
                    final item = _items[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        title: Text(item['label'] as String),
                        subtitle: Text('Status: ${item['status']}'),
                        trailing: Chip(
                          label: Text(item['status'] as String),
                          backgroundColor: item['status'] == 'active' ? Colors.green[100] : Colors.orange[100],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
