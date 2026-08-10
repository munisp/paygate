import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class PaymentLinksScreen extends ConsumerStatefulWidget {
  const PaymentLinksScreen({super.key});
  @override
  ConsumerState<PaymentLinksScreen> createState() => _PaymentLinksScreenState();
}

class _PaymentLinksScreenState extends ConsumerState<PaymentLinksScreen> {
  List<dynamic> _links = [];
  bool _loading = true;
  String? _error;
  bool _creating = false;

  final _nameCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _nameCtrl.dispose(); _amountCtrl.dispose(); _descCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.listPaymentLinks();
      final rows = result['rows'] ?? result['links'] ?? result['data'] ?? [];
      setState(() { _links = rows is List ? rows : []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _create() async {
    if (_nameCtrl.text.isEmpty || _amountCtrl.text.isEmpty) return;
    setState(() => _creating = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.createPaymentLink({
        'name': _nameCtrl.text,
        'amount': double.parse(_amountCtrl.text),
        'description': _descCtrl.text,
        'currency': 'NGN',
      });
      _nameCtrl.clear(); _amountCtrl.clear(); _descCtrl.clear();
      if (mounted) Navigator.pop(context);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  void _showCreateDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Create Payment Link', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            const SizedBox(height: 16),
            TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: _amountCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (NGN)', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: _descCtrl, decoration: const InputDecoration(labelText: 'Description (optional)', border: OutlineInputBorder())),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _creating ? null : _create,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                child: _creating ? const CircularProgressIndicator(color: Colors.white, strokeWidth: 2) : const Text('Create'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Links'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDialog,
        backgroundColor: const Color(0xFF6366F1),
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
          ? Center(child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text(_error!),
                ElevatedButton(onPressed: _load, child: const Text('Retry')),
              ],
            ))
          : _links.isEmpty
            ? const Center(child: Text('No payment links yet'))
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _links.length,
                  itemBuilder: (ctx, i) {
                    final l = _links[i];
                    final url = l['url'] ?? l['link_url'] ?? '';
                    final status = l['status'] ?? 'active';
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: status == 'active' ? Colors.green.withOpacity(0.15) : Colors.grey.withOpacity(0.15),
                          child: Icon(Icons.link, color: status == 'active' ? Colors.green : Colors.grey),
                        ),
                        title: Text(l['name'] ?? 'Payment Link', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('NGN ${(l['amount'] ?? 0.0).toString()}'),
                            Text('Visits: ${l['visit_count'] ?? l['visits'] ?? 0}  •  Paid: ${l['paid_count'] ?? l['conversions'] ?? 0}',
                              style: const TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.copy, size: 20),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: url));
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied!')));
                          },
                        ),
                      ),
                    );
                  },
                ),
              ),
    );
  }
}
