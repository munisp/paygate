import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// Referrals Screen — fully wired to PayGate tRPC backend.
class ReferralsScreen extends StatefulWidget {
  const ReferralsScreen({super.key});
  @override
  State<ReferralsScreen> createState() => __ReferralsScreenState();
}

class __ReferralsScreenState extends State<ReferralsScreen> {
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
      final result = await api.query('referrals.summary');
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
            Icon(Icons.people, color: const Color(0xFF334155), size: 64),
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
    final data = _data as Map<String, dynamic>? ?? {};
    final referrals = (data['referrals'] as List?) ?? [];
    final totalEarned = (data['totalEarnedNgn'] as num?)?.toDouble() ?? 0.0;
    final code = data['referralCode']?.toString() ?? '-';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Your Referral Code', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                const SizedBox(height: 8),
                Text(code, style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.w800, fontSize: 24, fontFamily: 'monospace')),
                const SizedBox(height: 8),
                Text('Total Earned: ₦${(totalEarned / 100).toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFF22C55E), fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Referred Merchants', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          if (referrals.isEmpty)
            const Center(child: Text('No referrals yet. Share your code!', style: TextStyle(color: Color(0xFF64748B)))),
          ...referrals.map((r) {
            final ref = r as Map<String, dynamic>;
            return Card(
              color: const Color(0xFF1E293B),
              margin: const EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: ListTile(
                leading: const Icon(Icons.person, color: Color(0xFF6366F1)),
                title: Text(ref['name']?.toString() ?? '-', style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w600)),
                subtitle: Text('Joined: ${_formatDate(ref['joinedAt']?.toString())}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                trailing: Text('₦${((ref['rewardNgn'] as num?)?.toDouble() ?? 0.0 / 100).toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFF22C55E), fontWeight: FontWeight.w700)),
              ),
            );
          }),
        ],
      ),
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
          'Referrals',
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
                      Text('Failed to load Referrals', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
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
