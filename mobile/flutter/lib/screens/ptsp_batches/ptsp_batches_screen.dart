import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Placeholder for the data model
class PtspBatch {
  final String id;
  final String name;
  final double amount;
  final String status;
  final DateTime createdAt;

  PtspBatch({
    required this.id,
    required this.name,
    required this.amount,
    required this.status,
    required this.createdAt,
  });

  factory PtspBatch.fromJson(Map<String, dynamic> json) {
    return PtspBatch(
      id: json['id'],
      name: json['name'],
      amount: (json['amount'] as num).toDouble(),
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

// Riverpod provider for fetching PTSP batches
final ptspBatchesProvider = FutureProvider.autoDispose<List<PtspBatch>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/ptspBatches.list');
  // return (response.data as List).map((json) => PtspBatch.fromJson(json)).toList();

  // Mock data for now
  await Future.delayed(const Duration(seconds: 1));
  return [
    PtspBatch(id: '1', name: 'Batch A', amount: 1500.00, status: 'Completed', createdAt: DateTime.now().subtract(const Duration(days: 5))),
    PtspBatch(id: '2', name: 'Batch B', amount: 250.50, status: 'Pending', createdAt: DateTime.now().subtract(const Duration(days: 2))),
    PtspBatch(id: '3', name: 'Batch C', amount: 750.25, status: 'Failed', createdAt: DateTime.now().subtract(const Duration(days: 10))),
    PtspBatch(id: '4', name: 'Batch D', amount: 1200.00, status: 'Completed', createdAt: DateTime.now().subtract(const Duration(days: 1))),
    PtspBatch(id: '5', name: 'Batch E', amount: 300.00, status: 'Pending', createdAt: DateTime.now().subtract(const Duration(days: 7))),
  ];
});

class PtspBatchesScreen extends ConsumerStatefulWidget {
  const PtspBatchesScreen({super.key});

  @override
  ConsumerState<PtspBatchesScreen> createState() => _PtspBatchesScreenState();
}

class _PtspBatchesScreenState extends ConsumerState<PtspBatchesScreen> {
  String _searchQuery = '';
  String? _filterStatus;
  bool _isSearching = false;

  @override
  Widget build(BuildContext context) {
    final ptspBatchesAsyncValue = ref.watch(ptspBatchesProvider);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  hintText: 'Search batches...',
                  hintStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  border: InputBorder.none,
                ),
              )
            : const Text('PTSP Batches'),
        backgroundColor: const Color(0xFF1e293b),
        foregroundColor: const Color(0xFFf1f5f9),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchQuery = ''; // Clear search when closing
                }
              });
            },
          ),
          PopupMenuButton<String>(
            onSelected: (String value) {
              setState(() {
                _filterStatus = value == 'All' ? null : value;
                // Re-fetch or filter data based on status
                ref.invalidate(ptspBatchesProvider);
              });
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'All',
                child: Text('All'),
              ),
              const PopupMenuItem<String>(
                value: 'Completed',
                child: Text('Completed'),
              ),
              const PopupMenuItem<String>(
                value: 'Pending',
                child: Text('Pending'),
              ),
              const PopupMenuItem<String>(
                value: 'Failed',
                child: Text('Failed'),
              ),
            ],
            icon: const Icon(Icons.filter_list),
          ),
        ],
      ),
      backgroundColor: const Color(0xFF0f172a),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(ptspBatchesProvider);
        },
        child: ptspBatchesAsyncValue.when(
          data: (batches) {
            List<PtspBatch> filteredBatches = batches.where((batch) {
              final matchesSearch = batch.name.toLowerCase().contains(_searchQuery.toLowerCase());
              final matchesFilter = _filterStatus == null || batch.status == _filterStatus;
              return matchesSearch && matchesFilter;
            }).toList();

            if (filteredBatches.isEmpty) {
              return Center(
                child: Text(
                  _searchQuery.isNotEmpty || _filterStatus != null
                      ? 'No matching PTSP batches found.'
                      : 'No PTSP batches found.',
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: filteredBatches.length,
              itemBuilder: (context, index) {
                final batch = filteredBatches[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.all(8.0),
                  child: ListTile(
                    title: Text(batch.name, style: const TextStyle(color: Color(0xFFf1f5f9))),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Amount: ₦${batch.amount.toStringAsFixed(2)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Status: ${batch.status}',
                          style: TextStyle(
                            color: batch.status == 'Completed' ? Colors.greenAccent : (batch.status == 'Pending' ? Colors.orangeAccent : Colors.redAccent),
                          ),
                        ),
                        Text(
                          'Created: ${DateFormat('yyyy-MM-dd HH:mm').format(batch.createdAt)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                        ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                          onPressed: () {
                            _showEditBatchDialog(context, batch);
                          },
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () {
                            _confirmDeleteBatch(context, batch);
                          },
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (error, stack) => Center(
            child: Text(
              'Error: $error',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateBatchDialog(context);
        },
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  void _showCreateBatchDialog(BuildContext context) {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    String? selectedStatus;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Batch', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextFormField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Batch Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: amountController,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String>['Completed', 'Pending', 'Failed'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // TODO: Implement create batch API call
                final newBatch = PtspBatch(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  name: nameController.text,
                  amount: double.parse(amountController.text),
                  status: selectedStatus ?? 'Pending',
                  createdAt: DateTime.now(),
                );
                // Simulate API call
                // await ref.read(apiServiceProvider).post('/trpc/ptspBatches.create', body: newBatch.toJson());
                ref.invalidate(ptspBatchesProvider);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditBatchDialog(BuildContext context, PtspBatch batch) {
    final TextEditingController nameController = TextEditingController(text: batch.name);
    final TextEditingController amountController = TextEditingController(text: batch.amount.toStringAsFixed(2));
    String? selectedStatus = batch.status;

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Edit ${batch.name}', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextFormField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Batch Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: amountController,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String>['Completed', 'Pending', 'Failed'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                // TODO: Implement update batch API call
                final updatedBatch = PtspBatch(
                  id: batch.id,
                  name: nameController.text,
                  amount: double.parse(amountController.text),
                  status: selectedStatus ?? batch.status,
                  createdAt: batch.createdAt,
                );
                // Simulate API call
                // await ref.read(apiServiceProvider).post('/trpc/ptspBatches.update', body: updatedBatch.toJson());
                ref.invalidate(ptspBatchesProvider);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteBatch(BuildContext context, PtspBatch batch) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${batch.name}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                // TODO: Implement delete batch API call
                // await ref.read(apiServiceProvider).post('/trpc/ptspBatches.delete', body: {'id': batch.id});
                ref.invalidate(ptspBatchesProvider);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}