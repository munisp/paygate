import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class CrossBorderScreen extends ConsumerStatefulWidget {
  const CrossBorderScreen({super.key});
  @override
  ConsumerState<CrossBorderScreen> createState() => _CrossBorderScreenState();
}

class _CrossBorderScreenState extends ConsumerState<CrossBorderScreen> {
  List<dynamic> _transfers = [];
  bool _loading = true;
  String? _error;
  String _status = 'all';
  bool _initiating = false;

  final _recipientCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  String _fromCurrency = 'NGN';
  String _toCurrency = 'USD';
  final List<String> _currencies = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR'];

  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _recipientCtrl.dispose(); _amountCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.listCrossBorderTransactions(
        status: _status == 'all' ? null : _status,
      );
      final rows = result['rows'] ?? result['transfers'] ?? result['data'] ?? [];
      setState(() { _transfers = rows is List ? rows : []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _initiate() async {
    if (_recipientCtrl.text.isEmpty || _amountCtrl.text.isEmpty) return;
    setState(() => _initiating = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.initiateCrossBorderTransfer({
        'recipient_account': _recipientCtrl.text,
        'amount': double.parse(_amountCtrl.text),
        'from_currency': _fromCurrency,
        'to_currency': _toCurrency,
      });
      _recipientCtrl.clear(); _amountCtrl.clear();
      if (mounted) Navigator.pop(context);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer initiated')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _initiating = false);
    }
  }

  void _showInitiateDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
        child: StatefulBuilder(builder: (ctx, setS) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Initiate Cross-Border Transfer', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 16),
            TextField(controller: _recipientCtrl, decoration: const InputDecoration(labelText: 'Recipient Account/IBAN', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: TextField(controller: _amountCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount', border: OutlineInputBorder()))),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: _fromCurrency,
                items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setS(() => _fromCurrency = v!),
              ),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.arrow_forward, size: 16)),
              DropdownButton<String>(
                value: _toCurrency,
                items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setS(() => _toCurrency = v!),
              ),
            ]),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _initiating ? null : _initiate,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                child: _initiating ? const CircularProgressIndicator(color: Colors.white, strokeWidth: 2) : const Text('Initiate Transfer'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        )),
      ),
    );
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'completed': return Colors.green;
      case 'pending': return Colors.orange;
      case 'processing': return Colors.blue;
      case 'failed': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cross-Border'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showInitiateDialog,
        backgroundColor: const Color(0xFF6366F1),
        icon: const Icon(Icons.send, color: Colors.white),
        label: const Text('Transfer', style: TextStyle(color: Colors.white)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ['all', 'pending', 'processing', 'completed', 'failed'].map((s) =>
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(s[0].toUpperCase() + s.substring(1)),
                      selected: _status == s,
                      onSelected: (_) { setState(() => _status = s); _load(); },
                    ),
                  ),
                ).toList(),
              ),
            ),
          ),
          Expanded(
            child: _loading
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
                : _transfers.isEmpty
                  ? const Center(child: Text('No cross-border transfers'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _transfers.length,
                        itemBuilder: (ctx, i) {
                          final t = _transfers[i];
                          final status = t['status'] as String? ?? 'pending';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: _statusColor(status).withOpacity(0.15),
                                child: Icon(Icons.public, color: _statusColor(status), size: 20),
                              ),
                              title: Text(t['recipient_name'] ?? t['recipient_account'] ?? 'Transfer',
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text('${t['from_currency'] ?? ''} → ${t['to_currency'] ?? ''}  •  ${t['amount'] ?? ''}'),
                              trailing: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: _statusColor(status).withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(status, style: TextStyle(color: _statusColor(status), fontSize: 12)),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
          ),
        ],
      ),
    );
  }
}
