
import 'package:flutter/material.dart';

class FraudRuleEngineScreen extends StatefulWidget {
  const FraudRuleEngineScreen({super.key});
  @override
  State<FraudRuleEngineScreen> createState() => _FraudRuleEngineScreenState();
}

class _FraudRuleEngineScreenState extends State<FraudRuleEngineScreen> {
  final List<Map<String, dynamic>> _rules = [
    {'name': 'High Amount Block', 'condition': 'amount > 500000', 'action': 'block', 'enabled': true},
    {'name': 'Velocity Check', 'condition': 'tx_count_1h > 10', 'action': 'flag', 'enabled': true},
    {'name': 'Foreign Card Alert', 'condition': 'card_country != NG', 'action': 'notify', 'enabled': false},
  ];

  Color _actionColor(String action) {
    switch (action) {
      case 'block': return Colors.red;
      case 'flag': return Colors.orange;
      case 'notify': return Colors.blue;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fraud Rule Engine'),
        actions: [IconButton(icon: const Icon(Icons.add), onPressed: () {})],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _rules.length,
        itemBuilder: (ctx, i) {
          final rule = _rules[i];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _actionColor(rule['action']).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(rule['action'].toString().toUpperCase(),
                    style: TextStyle(color: _actionColor(rule['action']), fontSize: 10, fontWeight: FontWeight.bold)),
              ),
              title: Text(rule['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(rule['condition'], style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
              trailing: Switch(
                value: rule['enabled'],
                onChanged: (v) => setState(() => _rules[i]['enabled'] = v),
              ),
            ),
          );
        },
      ),
    );
  }
}
