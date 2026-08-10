import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a provider for the transaction receipts data
final transactionReceiptsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  // Simulate API call
  // In a real app, this would call the tRPC API:
  // final response = await ref.read(apiServiceProvider).api.get('/trpc/transactionReceipts.list');
  // return response.data as List<Map<String, dynamic>>;

  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  return [
    {
      'id': 'TRX001',
      'amount': 15000.00,
      'currency': 'NGN',
      'status': 'completed',
      'date': DateTime.now().subtract(const Duration(days: 1)),
      'customer': 'John Doe',
    },
    {
      'id': 'TRX002',
      'amount': 25.50,
      'currency': 'USD',
      'status': 'pending',
      'date': DateTime.now().subtract(const Duration(hours: 5)),
      'customer': 'Jane Smith',
    },
    {
      'id': 'TRX003',
      'amount': 500.00,
      'currency': 'NGN',
      'status': 'failed',
      'date': DateTime.now().subtract(const Duration(days: 3)),
      'customer': 'Peter Jones',
    },
  ];
});

class TransactionReceiptsV2Screen extends ConsumerStatefulWidget {
  const TransactionReceiptsV2Screen({super.key});

  @override
  ConsumerState<TransactionReceiptsV2Screen> createState() => _TransactionReceiptsV2ScreenState();
}

class _TransactionReceiptsV2ScreenState extends ConsumerState<TransactionReceiptsV2Screen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final transactionReceiptsAsyncValue = ref.watch(transactionReceiptsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Transaction Receipts V2', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card color for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Icon color
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                hintText: 'Search by customer or ID...', 
                hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b),
              ),
              onChanged: (query) {
                setState(() {
                  _searchQuery = query;
                });
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(transactionReceiptsProvider.future),
              child: transactionReceiptsAsyncValue.when(
                data: (receipts) {
                  final filteredReceipts = receipts.where((receipt) {
                    final customer = receipt['customer']?.toLowerCase() ?? '';
                    final id = receipt['id']?.toLowerCase() ?? '';
                    final query = _searchQuery.toLowerCase();
                    return customer.contains(query) || id.contains(query);
                  }).toList();

                  if (filteredReceipts.isEmpty) {
                    return const Center(
                      child: Text(
                        'No transaction receipts found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredReceipts.length,
                    itemBuilder: (context, index) {
                      final receipt = filteredReceipts[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background color
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(
                            'TRX ID: ${receipt['id']}',
                            style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Customer: ${receipt['customer']}', style: const TextStyle(color: Color(0xFFf1f5f9))), 
                              Text(
                                'Amount: ${receipt['currency'] == 'NGN' ? '₦' : '$'}${receipt['amount']?.toStringAsFixed(2)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              Text(
                                'Date: ${receipt['date'] != null ? (receipt['date'] as DateTime).toLocal().toString().split(' ')[0] : 'N/A'}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              _buildStatusBadge(receipt['status']),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showEditDialog(context, receipt),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Delete icon color
                                onPressed: () => _showDeleteConfirmationDialog(context, receipt['id']),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
                error: (err, stack) => Center(
                  child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    String statusText = status.toUpperCase();

    switch (status) {
      case 'completed':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'failed':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        statusText,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Receipt', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Create form goes here...', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                // Implement create logic here
                // ref.read(apiServiceProvider).api.post('/trpc/transactionReceipts.create', body: {...});
                Navigator.of(context).pop();
                ref.invalidate(transactionReceiptsProvider); // Refresh list
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, Map<String, dynamic> receipt) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Edit Receipt ${receipt['id']}', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Edit form goes here...', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                // Implement edit logic here
                // ref.read(apiServiceProvider).api.post('/trpc/transactionReceipts.update', body: {...});
                Navigator.of(context).pop();
                ref.invalidate(transactionReceiptsProvider); // Refresh list
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String receiptId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Receipt', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete receipt $receiptId?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                // Implement delete logic here
                // ref.read(apiServiceProvider).api.post('/trpc/transactionReceipts.delete', body: {'id': receiptId});
                Navigator.of(context).pop();
                ref.invalidate(transactionReceiptsProvider); // Refresh list
              },
            ),
          ],
        );
      },
    );
  }
}