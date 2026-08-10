import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';

class ReconciliationScreen extends StatefulWidget {
  const ReconciliationScreen({super.key});
  @override
  State<ReconciliationScreen> createState() => _ReconciliationScreenState();
}

class _ReconciliationScreenState extends State<ReconciliationScreen> {
  List<dynamic> _items = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiService>();
    try {
      final data = await api.get('/api/trpc/reconciliation.list?input={"limit":50}');
      setState(() { _items = data['result']?['data']?['items'] ?? []; });
    } catch (e) {
      debugPrint('Error: $e');
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _items.where((item) =>
      item.toString().toLowerCase().contains(_search.toLowerCase())
    ).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: const Text('Reconciliation'),
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search...',
                hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
                filled: true,
                fillColor: const Color(0xFF1E293B),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          Expanded(
            child: _loading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
              : filtered.isEmpty
                ? const Center(child: Text('No records found', style: TextStyle(color: Color(0xFF64748B))))
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) {
                      final item = filtered[i];
                      return Card(
                        color: const Color(0xFF1E293B),
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Text(item['name']?.toString() ?? item['id']?.toString() ?? 'Item',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                          subtitle: Text(item['status']?.toString() ?? item['email']?.toString() ?? '',
                            style: const TextStyle(color: Color(0xFF94A3B8))),
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
