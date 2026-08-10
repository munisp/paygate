import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for tRPC API response types
class Dispute {
  final String id;
  final String customerName;
  final String reason;
  final double amount;
  final String currency;
  final DateTime createdAt;
  String status;

  Dispute({
    required this.id,
    required this.customerName,
    required this.reason,
    required this.amount,
    required this.currency,
    required this.createdAt,
    required this.status,
  });

  factory Dispute.fromJson(Map<String, dynamic> json) {
    return Dispute(
      id: json['id'],
      customerName: json['customerName'],
      reason: json['reason'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      createdAt: DateTime.parse(json['createdAt']),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'reason': reason,
        'amount': amount,
        'currency': currency,
        'createdAt': createdAt.toIso8601String(),
        'status': status,
      };
}

// Placeholder for tRPC API service provider
final disputeListProvider = FutureProvider.family<List<Dispute>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/dispute.list', params: {'query': query});
  // return (response.data as List).map((e) => Dispute.fromJson(e)).toList();

  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1));
  final allDisputes = [
    Dispute(id: '1', customerName: 'Alice Smith', reason: 'Fraudulent transaction', amount: 150.00, currency: 'USD', createdAt: DateTime(2026, 5, 10), status: 'Pending'),
    Dispute(id: '2', customerName: 'Bob Johnson', reason: 'Item not received', amount: 2500.50, currency: 'NGN', createdAt: DateTime(2026, 5, 8), status: 'Resolved'),
    Dispute(id: '3', customerName: 'Charlie Brown', reason: 'Product damaged', amount: 75.20, currency: 'USD', createdAt: DateTime(2026, 5, 5), status: 'Rejected'),
    Dispute(id: '4', customerName: 'Diana Prince', reason: 'Unauthorized charge', amount: 500.00, currency: 'NGN', createdAt: DateTime(2026, 5, 12), status: 'Pending'),
  ];
  return allDisputes.where((d) => d.customerName.toLowerCase().contains(query.toLowerCase()) || d.reason.toLowerCase().contains(query.toLowerCase())).toList();
});

final disputeCreateProvider = FutureProvider.family<Dispute, Dispute>((ref, newDispute) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.post('/trpc/dispute.create', body: newDispute.toJson());
  // return Dispute.fromJson(response.data);

  await Future.delayed(const Duration(seconds: 1));
  return newDispute.copyWith(id: DateTime.now().millisecondsSinceEpoch.toString());
});

final disputeUpdateProvider = FutureProvider.family<Dispute, Dispute>((ref, updatedDispute) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.post('/trpc/dispute.update', body: updatedDispute.toJson());
  // return Dispute.fromJson(response.data);

  await Future.delayed(const Duration(seconds: 1));
  return updatedDispute;
});

final disputeDeleteProvider = FutureProvider.family<void, String>((ref, disputeId) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // await api.post('/trpc/dispute.delete', body: {'id': disputeId});

  await Future.delayed(const Duration(seconds: 1));
});

class DisputeWorkflowScreen extends ConsumerStatefulWidget {
  const DisputeWorkflowScreen({super.key});

  @override
  ConsumerState<DisputeWorkflowScreen> createState() => _DisputeWorkflowScreenState();
}

class _DisputeWorkflowScreenState extends ConsumerState<DisputeWorkflowScreen> {
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshDisputes() async {
    ref.invalidate(disputeListProvider(_searchQuery));
  }

  void _showCreateDisputeDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        final TextEditingController customerNameController = TextEditingController();
        final TextEditingController reasonController = TextEditingController();
        final TextEditingController amountController = TextEditingController();
        final TextEditingController currencyController = TextEditingController(text: 'USD');

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Dispute', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: reasonController,
                  decoration: const InputDecoration(
                    labelText: 'Reason',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: currencyController,
                  decoration: const InputDecoration(
                    labelText: 'Currency (e.g., USD, NGN)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                final newDispute = Dispute(
                  id: '', // Will be generated by backend
                  customerName: customerNameController.text,
                  reason: reasonController.text,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: currencyController.text.toUpperCase(),
                  createdAt: DateTime.now(),
                  status: 'Pending',
                );
                await ref.read(disputeCreateProvider(newDispute).future);
                _refreshDisputes();
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDisputeDialog(Dispute dispute) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        final TextEditingController customerNameController = TextEditingController(text: dispute.customerName);
        final TextEditingController reasonController = TextEditingController(text: dispute.reason);
        final TextEditingController amountController = TextEditingController(text: dispute.amount.toStringAsFixed(2));
        final TextEditingController currencyController = TextEditingController(text: dispute.currency);
        String selectedStatus = dispute.status;

        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Dispute', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: reasonController,
                  decoration: const InputDecoration(
                    labelText: 'Reason',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: currencyController,
                  decoration: const InputDecoration(
                    labelText: 'Currency (e.g., USD, NGN)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['Pending', 'Resolved', 'Rejected', 'Under Review']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      setState(() {
                        selectedStatus = newValue;
                      });
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                final updatedDispute = dispute.copyWith(
                  customerName: customerNameController.text,
                  reason: reasonController.text,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: currencyController.text.toUpperCase(),
                  status: selectedStatus,
                );
                await ref.read(disputeUpdateProvider(updatedDispute).future);
                _refreshDisputes();
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Update', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(String disputeId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Deletion', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this dispute?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                await ref.read(disputeDeleteProvider(disputeId).future);
                _refreshDisputes();
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending':
        return Colors.orange;
      case 'Resolved':
        return Colors.green;
      case 'Rejected':
        return Colors.red;
      case 'Under Review':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or Dollar sign
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final disputesAsyncValue = ref.watch(disputeListProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Dispute Workflow', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _showCreateDisputeDialog,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              decoration: InputDecoration(
                hintText: 'Search disputes...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshDisputes,
              color: const Color(0xFF6366f1),
              backgroundColor: const Color(0xFF1e293b),
              child: disputesAsyncValue.when(
                data: (disputes) {
                  if (disputes.isEmpty) {
                    return const Center(
                      child: Text(
                        'No disputes found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: disputes.length,
                    itemBuilder: (context, index) {
                      final dispute = disputes[index];
                      return Card(
                        color: const Color(0xFF1e293b),
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Customer: ${dispute.customerName}',
                                style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Reason: ${dispute.reason}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Amount: ${_formatAmount(dispute.amount, dispute.currency)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Date: ${_formatDate(dispute.createdAt)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: _getStatusColor(dispute.status),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    dispute.status,
                                    style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                    onPressed: () => _showEditDisputeDialog(dispute),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _showDeleteConfirmationDialog(dispute.id),
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
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(
                  child: Text(
                    'Error: $err',
                    style: const TextStyle(color: Colors.red, fontSize: 16),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

extension on Dispute {
  Dispute copyWith({
    String? id,
    String? customerName,
    String? reason,
    double? amount,
    String? currency,
    DateTime? createdAt,
    String? status,
  }) {
    return Dispute(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      reason: reason ?? this.reason,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
    );
  }
}
