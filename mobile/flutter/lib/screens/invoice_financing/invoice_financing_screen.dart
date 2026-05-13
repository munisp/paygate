import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class InvoiceFinancingScreen extends ConsumerStatefulWidget {
  const InvoiceFinancingScreen({super.key});
  @override
  ConsumerState<InvoiceFinancingScreen> createState() => _InvoiceFinancingScreenState();
}

class _InvoiceFinancingScreenState extends ConsumerState<InvoiceFinancingScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  int _page = 1;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool refresh = false}) async {
    if (refresh) {
      setState(() { _page = 1; _hasMore = true; _items = []; });
    }
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.listInvoiceFinancing(page: _page);
      final data = result['data'] as Map<String, dynamic>? ?? result;
      final rows = (data['rows'] ?? data['items'] ?? data['data'] ?? result['result']?['data']?['json']?['rows'] ?? []) as List;
      setState(() {
        if (refresh || _page == 1) {
          _items = rows.cast<Map<String, dynamic>>();
        } else {
          _items.addAll(rows.cast<Map<String, dynamic>>());
        }
        _hasMore = rows.length >= 20;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (!_hasMore || _loading) return;
    _page++;
    await _loadData();
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active': case 'completed': case 'approved': case 'verified': return Colors.green;
      case 'pending': case 'review': case 'open': return Colors.orange;
      case 'inactive': case 'rejected': case 'suspended': case 'closed': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Invoice Financing'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _loadData(refresh: true),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadData(refresh: true),
        child: _error != null
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.account_balance, size: 48, color: Colors.red[300]),
                    const SizedBox(height: 12),
                    Text('Failed to load data', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(_error!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _loadData(refresh: true),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                    ),
                  ],
                ),
              )
            : _loading && _items.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.account_balance, size: 64, color: Colors.indigo[200]),
                            const SizedBox(height: 16),
                            Text('No Invoice Financing found', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 8),
                            const Text('Pull down to refresh', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (notification is ScrollEndNotification && notification.metrics.pixels >= notification.metrics.maxScrollExtent - 200) {
                            _loadMore();
                          }
                          return false;
                        },
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _items.length + (_hasMore ? 1 : 0),
                          itemBuilder: (ctx, i) {
                            if (i == _items.length) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            }
                            final item = _items[i];
                            final status = item['status'] ?? 'pending';
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              elevation: 2,
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: Colors.indigo[100],
                                  child: Icon(Icons.account_balance, color: Colors.indigo[700], size: 20),
                                ),
                                title: Text(
                                  item['invoiceNumber'] ?? item['label'] ?? 'Application',
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  item['amount'] != null ? '₦${item["amount"]}' : item['status'] ?? '',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: _statusColor(status).withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    status.toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      color: _statusColor(status),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
      ),
    );
  }
}
