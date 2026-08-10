import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a data model for a Consumer Dispute
class ConsumerDispute {
  final String id;
  final String customerName;
  final String transactionId;
  final double amount;
  final String currency;
  final String status;
  final DateTime createdAt;
  final String reason;

  ConsumerDispute({
    required this.id,
    required this.customerName,
    required this.transactionId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
    required this.reason,
  });

  factory ConsumerDispute.fromJson(Map<String, dynamic> json) {
    return ConsumerDispute(
      id: json['id'] as String,
      customerName: json['customerName'] as String,
      transactionId: json['transactionId'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      reason: json['reason'] as String,
    );
  }
}

// Define a Riverpod provider for fetching consumer disputes
final consumerDisputesProvider = FutureProvider.family<
    List<ConsumerDispute>, Map<String, dynamic>>((ref, params) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for listing disputes
  // In a real scenario, you would use: await api.get('/trpc/consumerDisputes.list', params: params);
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Dummy data for demonstration
  final List<Map<String, dynamic>> dummyData = [
    {
      'id': 'd1',
      'customerName': 'Alice Smith',
      'transactionId': 'txn123',
      'amount': 150.00,
      'currency': 'NGN',
      'status': 'Pending',
      'createdAt': '2026-05-10T10:00:00Z',
      'reason': 'Unauthorized transaction',
    },
    {
      'id': 'd2',
      'customerName': 'Bob Johnson',
      'transactionId': 'txn456',
      'amount': 25.50,
      'currency': 'USD',
      'status': 'Resolved',
      'createdAt': '2026-05-08T14:30:00Z',
      'reason': 'Item not received',
    },
    {
      'id': 'd3',
      'customerName': 'Charlie Brown',
      'transactionId': 'txn789',
      'amount': 500.00,
      'currency': 'NGN',
      'status': 'Rejected',
      'createdAt': '2026-05-05T09:15:00Z',
      'reason': 'Duplicate charge',
    },
  ];

  List<ConsumerDispute> disputes = dummyData
      .map((e) => ConsumerDispute.fromJson(e))
      .where((dispute) {
        final searchQuery = (params['search'] as String? ?? '').toLowerCase();
        final filterStatus = params['status'] as String?;

        final matchesSearch = dispute.customerName.toLowerCase().contains(searchQuery) ||
            dispute.transactionId.toLowerCase().contains(searchQuery) ||
            dispute.reason.toLowerCase().contains(searchQuery);

        final matchesStatus = filterStatus == null || dispute.status == filterStatus;

        return matchesSearch && matchesStatus;
      })
      .toList();

  return disputes;
});

class ConsumerDisputesScreen extends ConsumerStatefulWidget {
  const ConsumerDisputesScreen({super.key});

  @override
  ConsumerState<ConsumerDisputesScreen> createState() =>
      _ConsumerDisputesScreenState();
}

class _ConsumerDisputesScreenState extends ConsumerState<ConsumerDisputesScreen> {
  String _searchQuery = '';
  String? _filterStatus;

  @override
  Widget build(BuildContext context) {
    final disputesAsyncValue = ref.watch(consumerDisputesProvider({
      'search': _searchQuery,
      'status': _filterStatus,
    }));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Consumer Disputes', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(consumerDisputesProvider({
          'search': _searchQuery,
          'status': _filterStatus,
        }).future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  hintText: 'Search disputes...',
                  hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  filled: true,
                  fillColor: const Color(0xFF1e293b),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            // Filter dropdown (example, can be expanded)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0),
              child: DropdownButtonFormField<String?>(
                value: _filterStatus,
                decoration: InputDecoration(
                  labelText: 'Filter by Status',
                  labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                  filled: true,
                  fillColor: const Color(0xFF1e293b),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                items: <String?>[null, 'Pending', 'Resolved', 'Rejected']
                    .map<DropdownMenuItem<String?>>((String? value) {
                  return DropdownMenuItem<String?>(
                    value: value,
                    child: Text(value ?? 'All'),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    _filterStatus = newValue;
                  });
                },
              ),
            ),
            Expanded(
              child: disputesAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9))),
                ),
                data: (disputes) {
                  if (disputes.isEmpty) {
                    return const Center(
                      child: Text('No consumer disputes found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: disputes.length,
                    itemBuilder: (context, index) {
                      final dispute = disputes[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.all(8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Customer: ${dispute.customerName}', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                              Text('Transaction ID: ${dispute.transactionId}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Amount: ${formatCurrency(dispute.amount, dispute.currency)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Reason: ${dispute.reason}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), 
                              Text('Date: ${formatDate(dispute.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))), 
                              const SizedBox(height: 8.0),
                              _buildStatusBadge(dispute.status),
                              const SizedBox(height: 8.0),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  ElevatedButton(
                                    onPressed: () => _showEditDisputeDialog(context, dispute),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF6366f1), // Accent color
                                      foregroundColor: const Color(0xFFf1f5f9),
                                    ),
                                    child: const Text('View/Edit'),
                                  ),
                                  const SizedBox(width: 8.0),
                                  ElevatedButton(
                                    onPressed: () => _confirmDeleteDispute(context, dispute.id),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.redAccent, // Example delete color
                                      foregroundColor: const Color(0xFFf1f5f9),
                                    ),
                                    child: const Text('Delete'),
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
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDisputeDialog(context),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'resolved':
        badgeColor = Colors.green;
        break;
      case 'rejected':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12.0),
      ),
    );
  }

  String formatCurrency(double amount, String currency) {
    final isNaira = currency.toUpperCase() == 'NGN';
    final symbol = isNaira ? '₦' : '$'; // Naira or USD symbol
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  void _showCreateDisputeDialog(BuildContext context) {
    // Implement create dispute dialog logic here
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Dispute', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                // Form fields for creating a dispute
                TextFormField(
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Transaction ID',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency (e.g., NGN, USD)',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Reason',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  maxLines: 3,
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Create'),
              onPressed: () {
                // Call API to create dispute
                // ref.read(apiServiceProvider).post('/trpc/consumerDisputes.create', body: {...});
                Navigator.of(context).pop();
                ref.invalidate(consumerDisputesProvider);
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDisputeDialog(BuildContext context, ConsumerDispute dispute) {
    // Implement edit dispute dialog logic here
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Dispute', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('Dispute ID: ${dispute.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                const SizedBox(height: 10),
                TextFormField(
                  initialValue: dispute.customerName,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  initialValue: dispute.transactionId,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Transaction ID',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  initialValue: dispute.amount.toStringAsFixed(2),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  initialValue: dispute.currency,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency (e.g., NGN, USD)',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  initialValue: dispute.reason,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Reason',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: dispute.status,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    filled: true,
                    fillColor: const Color(0xFF1e293b),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String>['Pending', 'Resolved', 'Rejected']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    // Update status locally or in a temporary state
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Save'),
              onPressed: () {
                // Call API to update dispute
                // ref.read(apiServiceProvider).post('/trpc/consumerDisputes.update', body: {...});
                Navigator.of(context).pop();
                ref.invalidate(consumerDisputesProvider);
              },
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteDispute(BuildContext context, String disputeId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this dispute?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Delete'),
              onPressed: () {
                // Call API to delete dispute
                // ref.read(apiServiceProvider).post('/trpc/consumerDisputes.delete', body: {'id': disputeId});
                Navigator.of(context).pop();
                ref.invalidate(consumerDisputesProvider);
              },
            ),
          ],
        );
      },
    );
  }
}
