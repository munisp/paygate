import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the data model for a loan repayment
class LoanRepayment {
  final String id;
  final String loanId;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime repaymentDate;
  final String status;

  LoanRepayment({
    required this.id,
    required this.loanId,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.repaymentDate,
    required this.status,
  });

  factory LoanRepayment.fromJson(Map<String, dynamic> json) {
    return LoanRepayment(
      id: json['id'] as String,
      loanId: json['loanId'] as String,
      customerName: json['customerName'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      repaymentDate: DateTime.parse(json['repaymentDate'] as String),
      status: json['status'] as String,
    );
  }
}

// Riverpod provider for fetching loan repayments
final loanRepaymentsProvider = FutureProvider.family<List<LoanRepayment>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/loanRepayments.list', params: {'query': query});
  return (response['items'] as List)
      .map((item) => LoanRepayment.fromJson(item as Map<String, dynamic>))
      .toList();
});

// Riverpod provider for creating a loan repayment
final createLoanRepaymentProvider = FutureProvider.family<LoanRepayment, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/loanRepayments.create', body: data);
  return LoanRepayment.fromJson(response as Map<String, dynamic>);
});

// Riverpod provider for updating a loan repayment
final updateLoanRepaymentProvider = FutureProvider.family<LoanRepayment, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/loanRepayments.update', body: data);
  return LoanRepayment.fromJson(response as Map<String, dynamic>);
});

// Riverpod provider for deleting a loan repayment
final deleteLoanRepaymentProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/loanRepayments.delete', body: {'id': id});
});

class LoanRepaymentsScreen extends ConsumerStatefulWidget {
  const LoanRepaymentsScreen({super.key});

  @override
  ConsumerState<LoanRepaymentsScreen> createState() => _LoanRepaymentsScreenState();
}

class _LoanRepaymentsScreenState extends ConsumerState<LoanRepaymentsScreen> {
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loanRepaymentsAsyncValue = ref.watch(loanRepaymentsProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Loan Repayments', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateLoanRepaymentDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(loanRepaymentsProvider(_searchQuery).future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  hintText: 'Search repayments...',
                  hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  filled: true,
                  fillColor: const Color(0xFF1e293b), // Card background
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
              ),
            ),
            Expanded(
              child: loanRepaymentsAsyncValue.when(
                data: (repayments) {
                  if (repayments.isEmpty) {
                    return const Center(
                      child: Text(
                        'No loan repayments found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: repayments.length,
                    itemBuilder: (context, index) {
                      final repayment = repayments[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(
                            '${repayment.customerName} - ${repayment.currency} ${repayment.amount.toStringAsFixed(2)}',
                            style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Loan ID: ${repayment.loanId}',
                                style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                              ),
                              Text(
                                'Date: ${repayment.repaymentDate.toLocal().toString().split(' ')[0]}',
                                style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                              ),
                              _buildStatusBadge(repayment.status),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showEditLoanRepaymentDialog(context, repayment),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Delete color
                                onPressed: () => _confirmDeleteLoanRepayment(context, repayment),
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
                  child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
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
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  void _showCreateLoanRepaymentDialog(BuildContext context) {
    final TextEditingController loanIdController = TextEditingController();
    final TextEditingController customerNameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController();
    final TextEditingController statusController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Create Loan Repayment', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: loanIdController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Loan ID',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: customerNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: currencyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency (e.g., NGN, USD)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status (e.g., Completed, Pending)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final newRepaymentData = {
                  'loanId': loanIdController.text,
                  'customerName': customerNameController.text,
                  'amount': double.tryParse(amountController.text) ?? 0.0,
                  'currency': currencyController.text,
                  'repaymentDate': DateTime.now().toIso8601String(), // Assuming current date for creation
                  'status': statusController.text,
                };
                await ref.read(createLoanRepaymentProvider(newRepaymentData).future);
                ref.invalidate(loanRepaymentsProvider(_searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _showEditLoanRepaymentDialog(BuildContext context, LoanRepayment repayment) {
    final TextEditingController loanIdController = TextEditingController(text: repayment.loanId);
    final TextEditingController customerNameController = TextEditingController(text: repayment.customerName);
    final TextEditingController amountController = TextEditingController(text: repayment.amount.toString());
    final TextEditingController currencyController = TextEditingController(text: repayment.currency);
    final TextEditingController statusController = TextEditingController(text: repayment.status);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Edit Loan Repayment', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: loanIdController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Loan ID',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: customerNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: currencyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency (e.g., NGN, USD)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Status (e.g., Completed, Pending)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                final updatedRepaymentData = {
                  'id': repayment.id,
                  'loanId': loanIdController.text,
                  'customerName': customerNameController.text,
                  'amount': double.tryParse(amountController.text) ?? 0.0,
                  'currency': currencyController.text,
                  'repaymentDate': repayment.repaymentDate.toIso8601String(),
                  'status': statusController.text,
                };
                await ref.read(updateLoanRepaymentProvider(updatedRepaymentData).future);
                ref.invalidate(loanRepaymentsProvider(_searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
              child: const Text('Update', style: TextStyle(color: Color(0xFF6366f1))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteLoanRepayment(BuildContext context, LoanRepayment repayment) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text(
            'Are you sure you want to delete the repayment from ${repayment.customerName} for ${repayment.currency} ${repayment.amount.toStringAsFixed(2)}?',
            style: const TextStyle(color: Color(0xFFf1f5f9)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            TextButton(
              onPressed: () async {
                await ref.read(deleteLoanRepaymentProvider(repayment.id).future);
                ref.invalidate(loanRepaymentsProvider(_searchQuery)); // Refresh list
                Navigator.of(context).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}