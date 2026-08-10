import 'package:flutter/material.dart';
import '../../services/api_service.dart';

/// Webhooks screen — mirrors React Native WebhooksScreen
/// Displays webhook endpoints with real-time delivery status
class WebhooksScreen extends StatefulWidget {
  const WebhooksScreen({super.key});

  @override
  State<WebhooksScreen> createState() => _WebhooksScreenState();
}

class _WebhooksScreenState extends State<WebhooksScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _webhooks = [];
  List<Map<String, dynamic>> _deliveries = [];
  bool _loading = true;
  bool _refreshing = false;
  String _error = '';
  String _searchQuery = '';
  String _filterStatus = 'all';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool refresh = false}) async {
    if (refresh) setState(() => _refreshing = true);
    try {
      final results = await Future.wait([
        _api.listWebhooks(),
        _api.listWebhookDeliveries(),
      ]);
      if (mounted) {
        setState(() {
          _webhooks = List<Map<String, dynamic>>.from(results[0]['webhooks'] ?? results[0] ?? []);
          _deliveries = List<Map<String, dynamic>>.from(results[1]['deliveries'] ?? results[1] ?? []);
          _loading = false;
          _refreshing = false;
          _error = '';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
          _refreshing = false;
        });
      }
    }
  }

  Future<void> _toggleWebhook(String id, bool enabled) async {
    try {
      await _api.updateWebhook(id, {'active': !enabled});
      await _loadData(refresh: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Webhook ${!enabled ? "enabled" : "disabled"}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _retryDelivery(String deliveryId) async {
    try {
      await _api.retryWebhookDelivery(deliveryId);
      await _loadData(refresh: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Delivery retry queued')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Retry failed: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  List<Map<String, dynamic>> get _filteredWebhooks {
    return _webhooks.where((w) {
      final matchesSearch = _searchQuery.isEmpty ||
          (w['url'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (w['description'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesFilter = _filterStatus == 'all' ||
          (_filterStatus == 'active' && (w['active'] == true)) ||
          (_filterStatus == 'inactive' && (w['active'] != true));
      return matchesSearch && matchesFilter;
    }).toList();
  }

  Color _statusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'success': return const Color(0xFF10B981);
      case 'failed': return const Color(0xFFEF4444);
      case 'pending': return const Color(0xFFF59E0B);
      default: return const Color(0xFF94A3B8);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Webhooks', style: TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFF1F5F9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF94A3B8)),
            onPressed: () => _loadData(refresh: true),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _error.isNotEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 48),
                      const SizedBox(height: 12),
                      Text(_error, style: const TextStyle(color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadData(refresh: true),
                  color: const Color(0xFF6366F1),
                  child: CustomScrollView(
                    slivers: [
                      // Search + filter bar
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              TextField(
                                style: const TextStyle(color: Color(0xFFF1F5F9)),
                                decoration: InputDecoration(
                                  hintText: 'Search webhooks…',
                                  hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
                                  prefixIcon: const Icon(Icons.search, color: Color(0xFF94A3B8)),
                                  filled: true,
                                  fillColor: const Color(0xFF1E293B),
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                                ),
                                onChanged: (v) => setState(() => _searchQuery = v),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: ['all', 'active', 'inactive'].map((f) => Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: FilterChip(
                                    label: Text(f[0].toUpperCase() + f.substring(1), style: TextStyle(color: _filterStatus == f ? Colors.white : const Color(0xFF94A3B8), fontSize: 12)),
                                    selected: _filterStatus == f,
                                    onSelected: (_) => setState(() => _filterStatus = f),
                                    backgroundColor: const Color(0xFF1E293B),
                                    selectedColor: const Color(0xFF6366F1),
                                    checkmarkColor: Colors.white,
                                  ),
                                )).toList(),
                              ),
                            ],
                          ),
                        ),
                      ),
                      // Webhooks list
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Text(
                            'Endpoints (${_filteredWebhooks.length})',
                            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                      _filteredWebhooks.isEmpty
                          ? const SliverToBoxAdapter(
                              child: Center(
                                child: Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Text('No webhooks found', style: TextStyle(color: Color(0xFF94A3B8))),
                                ),
                              ),
                            )
                          : SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (context, i) {
                                  final w = _filteredWebhooks[i];
                                  final active = w['active'] == true;
                                  return Container(
                                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1E293B),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: const Color(0xFF334155)),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                w['url'] ?? 'Unknown URL',
                                                style: const TextStyle(color: Color(0xFFF1F5F9), fontWeight: FontWeight.w600, fontSize: 13),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            Switch(
                                              value: active,
                                              onChanged: (_) => _toggleWebhook(w['id']?.toString() ?? '', active),
                                              activeColor: const Color(0xFF6366F1),
                                            ),
                                          ],
                                        ),
                                        if (w['description'] != null) ...[
                                          const SizedBox(height: 4),
                                          Text(w['description'].toString(), style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                                        ],
                                        const SizedBox(height: 8),
                                        Wrap(
                                          spacing: 6,
                                          children: [
                                            _chip(active ? 'Active' : 'Inactive', active ? const Color(0xFF10B981) : const Color(0xFF94A3B8)),
                                            if (w['eventTypes'] != null)
                                              _chip('${(w['eventTypes'] as List).length} events', const Color(0xFF6366F1)),
                                          ],
                                        ),
                                      ],
                                    ),
                                  );
                                },
                                childCount: _filteredWebhooks.length,
                              ),
                            ),
                      // Recent deliveries
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(16, 20, 16, 8),
                          child: Text('Recent Deliveries', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      _deliveries.isEmpty
                          ? const SliverToBoxAdapter(
                              child: Center(
                                child: Padding(
                                  padding: EdgeInsets.all(24),
                                  child: Text('No deliveries yet', style: TextStyle(color: Color(0xFF94A3B8))),
                                ),
                              ),
                            )
                          : SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (context, i) {
                                  final d = _deliveries[i];
                                  final status = d['status']?.toString() ?? 'pending';
                                  return Container(
                                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1E293B),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: BoxDecoration(color: _statusColor(status), shape: BoxShape.circle),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(d['eventType']?.toString() ?? 'Unknown event', style: const TextStyle(color: Color(0xFFF1F5F9), fontSize: 13, fontWeight: FontWeight.w500)),
                                              Text('${d['responseCode'] ?? ''} · ${d['createdAt'] ?? ''}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                                            ],
                                          ),
                                        ),
                                        if (status == 'failed')
                                          TextButton(
                                            onPressed: () => _retryDelivery(d['id']?.toString() ?? ''),
                                            child: const Text('Retry', style: TextStyle(color: Color(0xFF6366F1), fontSize: 12)),
                                          ),
                                      ],
                                    ),
                                  );
                                },
                                childCount: _deliveries.take(20).length,
                              ),
                            ),
                      const SliverToBoxAdapter(child: SizedBox(height: 32)),
                    ],
                  ),
                ),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}
