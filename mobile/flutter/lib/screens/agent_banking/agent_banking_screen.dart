import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AgentBankingScreen extends StatefulWidget {
  const AgentBankingScreen({super.key});
  @override
  State<AgentBankingScreen> createState() => _AgentBankingScreenState();
}

class _AgentBankingScreenState extends State<AgentBankingScreen> {
  final ApiService _api = ApiService();
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get('/api/trpc/agentBanking.getAgentStats');
      setState(() { _stats = data['result']['data']; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agent Banking')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Agent Banking Dashboard', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 16),
                      if (_stats != null) ...[
                        _StatCard(label: 'Active Agents', value: _stats!['activeAgents']?.toString() ?? '0'),
                        _StatCard(label: 'Total Transactions', value: _stats!['totalTransactions']?.toString() ?? '0'),
                        _StatCard(label: 'Total Volume', value: _stats!['totalVolume']?.toString() ?? '0'),
                      ],
                    ],
                  ),
                ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  const _StatCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      ),
    );
  }
}
