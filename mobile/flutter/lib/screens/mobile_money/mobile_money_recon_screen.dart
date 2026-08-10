import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// Mobile Money Recon Screen — fully wired to PayGate tRPC backend.
class MobileMoneyReconScreen extends StatefulWidget {
  const MobileMoneyReconScreen({super.key});
  @override
  State<MobileMoneyReconScreen> createState() => __MobileMoneyReconScreenState();
}

class __MobileMoneyReconScreenState extends State<MobileMoneyReconScreen> {
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
      final result = await api.query('mobileMoneyRecon.list');
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
            Icon(Icons.phone_android, color: const Color(0xFF334155), size: 64),
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
      return _emptyState('No Reconciliation Records', 'Mobile money transactions will appear here.');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final r = items[i] as Map<String, dynamic>;
        final amount = (r['amount'] as num?)?.toDouble() ?? 0.0;
        final matched = r['status']?.toString() == 'matched';
        return Card(
          color: const Color(0xFF1E293B),
          margin: const EdgeInsets.only(bottom: 8),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          child: ListTile(
            leading: Icon(matched ? Icons.check_circle : Icons.error_outline, color: matched ? const Color(0xFF22C55E) : const Color(0xFFF59E0B)),
            title: Text(r['reference']?.toString() ?? '-', style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w600)),
            subtitle: Text('${r['provider'] ?? '-'}  •  ${_formatDate(r['createdAt']?.toString())}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
            trailing: Text('₦${(amount / 100).toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w700)),
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
          'Mobile Money Recon',
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
                      Text('Failed to load Mobile Money Recon', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
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
