import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// AI Insights Screen — fully wired to PayGate tRPC backend.
class AiInsightsScreen extends StatefulWidget {
  const AiInsightsScreen({super.key});
  @override
  State<AiInsightsScreen> createState() => __AiInsightsScreenState();
}

class __AiInsightsScreenState extends State<AiInsightsScreen> {
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
      final result = await api.query('aiInsights.summary');
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
            Icon(Icons.auto_awesome, color: const Color(0xFF334155), size: 64),
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
    final insights = (data['insights'] as List?) ?? [];
    final score = (data['healthScore'] as num?)?.toDouble() ?? 0.0;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Business Health Score', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('${score.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 48)),
                    const Text('/100', style: TextStyle(color: Colors.white60, fontSize: 20, fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(data['summary']?.toString() ?? 'AI analysis based on your recent transactions.', style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Key Insights', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          if (insights.isEmpty)
            const Center(child: Text('Generating insights...', style: TextStyle(color: Color(0xFF64748B)))),
          ...insights.map((ins) {
            final insight = ins as Map<String, dynamic>;
            final type = insight['type']?.toString() ?? 'info';
            final color = type == 'warning' ? const Color(0xFFF59E0B)
                : type == 'positive' ? const Color(0xFF22C55E)
                : const Color(0xFF6366F1);
            return Card(
              color: const Color(0xFF1E293B),
              margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      type == 'warning' ? Icons.warning_amber : type == 'positive' ? Icons.trending_up : Icons.lightbulb_outline,
                      color: color,
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(insight['title']?.toString() ?? '-', style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w600, fontSize: 14)),
                          const SizedBox(height: 4),
                          Text(insight['description']?.toString() ?? '-', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
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
          'AI Insights',
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
                      Text('Failed to load AI Insights', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 16)),
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
