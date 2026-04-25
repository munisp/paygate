import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class FXScreen extends ConsumerStatefulWidget {
  const FXScreen({super.key});
  @override
  ConsumerState<FXScreen> createState() => _FXScreenState();
}

class _FXScreenState extends ConsumerState<FXScreen> {
  Map<String, dynamic>? _rates;
  bool _loading = true;
  String? _error;
  String _base = 'USD';
  final _fromCtrl = TextEditingController(text: '100');
  String _fromCurrency = 'USD';
  String _toCurrency = 'NGN';
  String? _convertResult;
  bool _converting = false;

  final List<String> _currencies = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'XOF'];

  @override
  void initState() {
    super.initState();
    _loadRates();
  }

  @override
  void dispose() {
    _fromCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadRates() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.getFxRates(baseCurrency: _base);
      setState(() { _rates = result; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _convert() async {
    final amount = double.tryParse(_fromCtrl.text);
    if (amount == null) return;
    setState(() { _converting = true; _convertResult = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.convertCurrency(_fromCurrency, _toCurrency, amount);
      final converted = result['converted'] ?? result['amount'] ?? result['result'];
      setState(() {
        _convertResult = '$_toCurrency ${(converted as num).toStringAsFixed(4)}';
        _converting = false;
      });
    } catch (e) {
      setState(() { _convertResult = 'Error: $e'; _converting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final rateMap = _rates?['rates'] as Map? ?? {};
    return Scaffold(
      appBar: AppBar(
        title: const Text('FX Rates'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadRates),
        ],
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
                ElevatedButton(onPressed: _loadRates, child: const Text('Retry')),
              ],
            ))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Converter card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Currency Converter', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(child: TextField(
                            controller: _fromCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Amount', border: OutlineInputBorder()),
                          )),
                          const SizedBox(width: 8),
                          DropdownButton<String>(
                            value: _fromCurrency,
                            items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                            onChanged: (v) => setState(() => _fromCurrency = v!),
                          ),
                          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.arrow_forward)),
                          DropdownButton<String>(
                            value: _toCurrency,
                            items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                            onChanged: (v) => setState(() => _toCurrency = v!),
                          ),
                        ]),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _converting ? null : _convert,
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
                            child: _converting ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Convert'),
                          ),
                        ),
                        if (_convertResult != null) ...[
                          const SizedBox(height: 8),
                          Text(_convertResult!, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF6366F1))),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Base currency selector
                Row(children: [
                  const Text('Base: ', style: TextStyle(fontWeight: FontWeight.bold)),
                  DropdownButton<String>(
                    value: _base,
                    items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                    onChanged: (v) { setState(() => _base = v!); _loadRates(); },
                  ),
                ]),
                const SizedBox(height: 8),
                ...rateMap.entries.map((e) => ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.currency_exchange, size: 16)),
                  title: Text(e.key),
                  trailing: Text((e.value as num).toStringAsFixed(4), style: const TextStyle(fontWeight: FontWeight.bold)),
                )),
              ],
            ),
    );
  }
}
