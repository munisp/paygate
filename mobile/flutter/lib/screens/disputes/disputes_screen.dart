import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class DisputesScreen extends ConsumerStatefulWidget {
  const DisputesScreen({super.key});
  @override
  ConsumerState<DisputesScreen> createState() => _DisputesScreenState();
}

class _DisputesScreenState extends ConsumerState<DisputesScreen> {
  String _selectedStatus = 'all';
  List<dynamic> _disputes = [];
  bool _isLoading = true;
  String? _error;

  final _statuses = ['all', 'open', 'under_review', 'resolved', 'closed'];

  @override
  void initState() {
    super.initState();
    _loadDisputes();
  }

  Future<void> _loadDisputes() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.get('/trpc/disputes.list', params: {
        if (_selectedStatus != 'all') 'status': _selectedStatus,
        'limit': '50',
      });
      final data = result['result']?['data'] ?? result['data'] ?? [];
      setState(() { _disputes = data is List ? data : []; _isLoading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _isLoading = false; });
    }
  }

  Future<void> _respondToDispute(String id, String response) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/disputes.respond', body: {'id': id, 'response': response});
      _loadDisputes();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Response submitted'), backgroundColor: Color(0xFF22c55e)),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: const Color(0xFFef4444)),
      );
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'open': return const Color(0xFFf59e0b);
      case 'under_review': return const Color(0xFF3b82f6);
      case 'resolved': return const Color(0xFF22c55e);
      case 'closed': return const Color(0xFF64748b);
      default: return const Color(0xFF94a3b8);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Disputes', style: TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.w700)),
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: SizedBox(
            height: 48,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _statuses.length,
              itemBuilder: (ctx, i) {
                final s = _statuses[i];
                final selected = s == _selectedStatus;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(s.replaceAll('_', ' ').toUpperCase(),
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                        color: selected ? Colors.white : const Color(0xFF94a3b8))),
                    selected: selected,
                    onSelected: (_) { setState(() => _selectedStatus = s); _loadDisputes(); },
                    backgroundColor: const Color(0xFF334155),
                    selectedColor: const Color(0xFF3b82f6),
                    checkmarkColor: Colors.white,
                    side: BorderSide.none,
                  ),
                );
              },
            ),
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF3b82f6)))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: Color(0xFFef4444), size: 48),
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Color(0xFF94a3b8))),
                  const SizedBox(height: 16),
                  ElevatedButton(onPressed: _loadDisputes, child: const Text('Retry')),
                ]))
              : _disputes.isEmpty
                  ? const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.gavel_rounded, color: Color(0xFF334155), size: 64),
                      SizedBox(height: 16),
                      Text('No disputes found', style: TextStyle(color: Color(0xFF64748b), fontSize: 16)),
                    ]))
                  : RefreshIndicator(
                      onRefresh: _loadDisputes,
                      color: const Color(0xFF3b82f6),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _disputes.length,
                        itemBuilder: (ctx, i) {
                          final d = _disputes[i] as Map<String, dynamic>;
                          final status = (d['status'] ?? 'open') as String;
                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1e293b),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF334155)),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(d['reference'] ?? d['id'] ?? '',
                                  style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.w600))),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: _statusColor(status).withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(status.toUpperCase(),
                                    style: TextStyle(color: _statusColor(status), fontSize: 11, fontWeight: FontWeight.w700)),
                                ),
                              ]),
                              const SizedBox(height: 8),
                              Text(d['reason'] ?? d['description'] ?? 'No description',
                                style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 13)),
                              const SizedBox(height: 8),
                              Row(children: [
                                const Icon(Icons.calendar_today_rounded, size: 13, color: Color(0xFF64748b)),
                                const SizedBox(width: 4),
                                Text(d['createdAt'] ?? d['created_at'] ?? '',
                                  style: const TextStyle(color: Color(0xFF64748b), fontSize: 12)),
                                const Spacer(),
                                if (status == 'open')
                                  TextButton(
                                    onPressed: () => _showRespondDialog(d['id'] as String),
                                    style: TextButton.styleFrom(foregroundColor: const Color(0xFF3b82f6)),
                                    child: const Text('Respond', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                  ),
                              ]),
                            ]),
                          );
                        },
                      ),
                    ),
    );
  }

  void _showRespondDialog(String id) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Respond to Dispute', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          style: const TextStyle(color: Color(0xFFf1f5f9)),
          decoration: const InputDecoration(
            hintText: 'Enter your response...',
            hintStyle: TextStyle(color: Color(0xFF64748b)),
            filled: true,
            fillColor: Color(0xFF0f172a),
            border: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF334155))),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () { Navigator.pop(ctx); _respondToDispute(id, ctrl.text); },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3b82f6)),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}
