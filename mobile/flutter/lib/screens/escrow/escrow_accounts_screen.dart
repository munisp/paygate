import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// Escrow Accounts Screen — fully wired to PayGate tRPC backend.
class EscrowAccountsScreen extends StatefulWidget {
  const EscrowAccountsScreen({super.key});
  @override
  State<EscrowAccountsScreen> createState() => __EscrowAccountsScreenState();
}

class __EscrowAccountsScreenState extends State<EscrowAccountsScreen> {
  bool _isLoading = false;
  String? _error;
  dynamic _data;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiService(baseUrl: auth.apiBaseUrl, token: auth.token);
      final result = await api.query('escrow.list');
      setState(() { _data = result; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _isLoading = false; });
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return '-';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return iso.length > 10 ? iso.substring(0, 10) : iso;
    }
  }

  Widget _emptyState(String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_clock, color: const Color(0xFF334155), size: 64),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(color: Color(0xFFF1F5F9), fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(subtitle, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }


  Widget _buildContent(ThemeData theme) {
    final items = (_data as List?) ?? [];
    if (items.isEmpty) {
      return _emptyState('No Escrow Accounts', 'Create an escrow account to hold funds securely.');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final e = items[i] as Map<String, dynamic>;
        final amount = (e['amount'] as num?)?.toDouble() ?? 0.0;
        final status = e['status']?.toString() ?? 'active';
        final statusColor = status == 'released' ? const Color(0xFF22C55E)
            : status == 'disputed' ? const Color(0xFFEF4444)
            : const Color(0xFF6366F1);
        return Card(
          color: const Color(0xFF1E293B),
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('₦${(amount / 100).toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w800, fontSize: 18)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: statusColor.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                      child: Text(status.toUpperCase(), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Ref: ${e['reference'] ?? e['id'] ?? '-'}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                Text('Beneficiary: ${e['beneficiaryName'] ?? '-'}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
                if (e['releaseDate'] != null)
                  Text('Release: ${_formatDate(e['releaseDate'].toString())}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
              ],
            ),
          ),
        );
      },
    );
  }


  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        title: const Text(
          'Escrow Accounts',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 48),
                      const SizedBox(height: 16),
                      Text('Failed to load Escrow Accounts', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: _loadData,
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _buildContent(theme),
    );
  }
}
