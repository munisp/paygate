import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart'; // Assuming api_service.dart is in ../../services/
import 'payout_batching_model.dart';
import 'payout_batching_model.freezed.dart';
import 'payout_batching_model.g.dart';
// import 'mock_api_service.dart'; // For testing purposes, will be replaced by real api_service

// Providers for search query and filter status
final searchQueryProvider = StateProvider<String>((ref) => '');
final filterStatusProvider = StateProvider<String?>((ref) => null);

// Define a provider for the PayoutBatching data, now with search and filter
final payoutBatchingProvider = FutureProvider.autoDispose<List<PayoutBatch>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);
  final filterStatus = ref.watch(filterStatusProvider);

  final response = await api.get('/trpc/payoutBatching.list');
  List<PayoutBatch> allBatches = (response['payoutBatches'] as List)
      .map((e) => PayoutBatch.fromJson(e))
      .toList();

  // Apply search filter
  if (searchQuery.isNotEmpty) {
    allBatches = allBatches.where((batch) =>
        batch.id.toLowerCase().contains(searchQuery.toLowerCase()) ||
        batch.status.toLowerCase().contains(searchQuery.toLowerCase())
    ).toList();
  }

  // Apply status filter
  if (filterStatus != null && filterStatus != 'All') {
    allBatches = allBatches.where((batch) => batch.status == filterStatus).toList();
  }

  return allBatches;
});

class PayoutBatchingScreen extends ConsumerStatefulWidget {
  const PayoutBatchingScreen({super.key});

  @override
  ConsumerState<PayoutBatchingScreen> createState() => _PayoutBatchingScreenState();
}

class _PayoutBatchingScreenState extends ConsumerState<PayoutBatchingScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Function to show create/edit dialog
  Future<void> _showBatchDialog({PayoutBatch? batch}) async {
    final isEditing = batch != null;
    final TextEditingController idController = TextEditingController(text: batch?.id ?? '');
    final TextEditingController amountController = TextEditingController(text: batch?.totalAmount.toString() ?? '');
    final TextEditingController payoutCountController = TextEditingController(text: batch?.payoutCount.toString() ?? '');
    String? selectedStatus = batch?.status;
    String? selectedCurrency = batch?.currency;

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Payout Batch' : 'Create Payout Batch', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isEditing) ...[
                TextField(
                  controller: idController,
                  readOnly: true,
                  decoration: InputDecoration(
                    labelText: 'Batch ID',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
              ],
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Total Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: payoutCountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Payout Count',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: _cardColor,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: ['Pending', 'Processing', 'Completed', 'Failed'].map((String status) {
                  return DropdownMenuItem<String>(
                    value: status,
                    child: Text(status, style: TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedStatus = newValue;
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedCurrency,
                dropdownColor: _cardColor,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: ['USD', 'NGN'].map((String currency) {
                  return DropdownMenuItem<String>(
                    value: currency,
                    child: Text(currency, style: TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedCurrency = newValue;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              final api = ref.read(apiServiceProvider);
              if (isEditing) {
                await api.post('/trpc/payoutBatching.update', body: {
                  'id': batch!.id,
                  'totalAmount': double.parse(amountController.text),
                  'payoutCount': int.parse(payoutCountController.text),
                  'status': selectedStatus,
                  'currency': selectedCurrency,
                });
              } else {
                await api.post('/trpc/payoutBatching.create', body: {
                  'totalAmount': double.parse(amountController.text),
                  'payoutCount': int.parse(payoutCountController.text),
                  'status': selectedStatus,
                  'currency': selectedCurrency,
                });
              }
              ref.invalidate(payoutBatchingProvider);
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor, foregroundColor: _textColor),
            child: Text(isEditing ? 'Save' : 'Create'),
          ),
        ],
      );
    });
  }

  // Function to show delete confirmation dialog
  Future<void> _confirmDelete(String batchId) async {
    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Confirm Delete', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete batch $batchId?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              final api = ref.read(apiServiceProvider);
              await api.post('/trpc/payoutBatching.delete', body: {'id': batchId});
              ref.invalidate(payoutBatchingProvider);
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: _textColor),
            child: const Text('Delete'),
          ),
        ],
      );
    });
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status) {
      case 'Completed':
        badgeColor = Colors.green;
        break;
      case 'Processing':
        badgeColor = Colors.blue;
        break;
      case 'Pending':
        badgeColor = Colors.orange;
        break;
      case 'Failed':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(status, style: TextStyle(color: _textColor, fontSize: 12)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final payoutBatchesAsyncValue = ref.watch(payoutBatchingProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('Payout Batching', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: Icon(Icons.add, color: _textColor),
            onPressed: () => _showBatchDialog(),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(100.0),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by Batch ID or Status',
                    hintStyle: TextStyle(color: _textColor.withOpacity(0.5)),
                    prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                    filled: true,
                    fillColor: _cardColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: filterStatus,
                  dropdownColor: _cardColor,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Filter by Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: ['All', 'Pending', 'Processing', 'Completed', 'Failed'].map((String status) {
                    return DropdownMenuItem<String>(
                      value: status,
                      child: Text(status, style: TextStyle(color: _textColor)),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    ref.read(filterStatusProvider.notifier).state = newValue;
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(payoutBatchingProvider.future),
        child: payoutBatchesAsyncValue.when(
          data: (batches) {
            if (batches.isEmpty) {
              return Center(
                child: Text(
                  'No payout batches found.',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              );
            }
            return ListView.builder(
              itemCount: batches.length,
              itemBuilder: (context, index) {
                final batch = batches[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Batch ID: ${batch.id}', style: TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _buildStatusBadge(batch.status),
                            Text(
                              '${batch.currency == 'NGN' ? '₦' : '$'}${batch.totalAmount.toStringAsFixed(2)}',
                              style: TextStyle(color: _textColor, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('Created At: ${batch.createdAt.toLocal().toIso8601String().split('T')[0]}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        Text('Payout Count: ${batch.payoutCount}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => _showBatchDialog(batch: batch),
                              child: Text('Edit', style: TextStyle(color: _accentColor)),
                            ),
                            TextButton(
                              onPressed: () => _confirmDelete(batch.id),
                              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: ${error.toString()}',
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
    );
  }
}
