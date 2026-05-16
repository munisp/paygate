import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy data model for BNPL Repayment
class BNPLRepayment {
  final String id;
  final String loanId;
  final double amount;
  final String currency;
  final DateTime dueDate;
  final DateTime? paidDate;
  final String status; // e.g., 'Pending', 'Paid', 'Overdue'

  BNPLRepayment({
    required this.id,
    required this.loanId,
    required this.amount,
    required this.currency,
    required this.dueDate,
    this.paidDate,
    required this.status,
  });

  factory BNPLRepayment.fromJson(Map<String, dynamic> json) {
    return BNPLRepayment(
      id: json['id'],
      loanId: json['loanId'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      dueDate: DateTime.parse(json['dueDate']),
      paidDate: json['paidDate'] != null ? DateTime.parse(json['paidDate']) : null,
      status: json['status'],
    );
  }
}

// Riverpod provider for fetching BNPL repayments
final bnplRepaymentsProvider = FutureProvider.autoDispose<List<BNPLRepayment>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // Replace with actual tRPC call: api.get('/trpc/bnplRepayments.list', params: {});
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Dummy data
  return [
    BNPLRepayment(
      id: 'rep_001',
      loanId: 'loan_001',
      amount: 15000.00,
      currency: 'NGN',
      dueDate: DateTime.now().add(const Duration(days: 5)),
      status: 'Pending',
    ),
    BNPLRepayment(
      id: 'rep_002',
      loanId: 'loan_002',
      amount: 250.50,
      currency: 'USD',
      dueDate: DateTime.now().subtract(const Duration(days: 10)),
      paidDate: DateTime.now().subtract(const Duration(days: 12)),
      status: 'Paid',
    ),
    BNPLRepayment(
      id: 'rep_003',
      loanId: 'loan_003',
      amount: 7500.00,
      currency: 'NGN',
      dueDate: DateTime.now().subtract(const Duration(days: 2)),
      status: 'Overdue',
    ),
    BNPLRepayment(
      id: 'rep_004',
      loanId: 'loan_004',
      amount: 120.00,
      currency: 'USD',
      dueDate: DateTime.now().add(const Duration(days: 20)),
      status: 'Pending',
    ),
  ];
});

class BNPLRepaymentPageScreen extends ConsumerStatefulWidget {
  const BNPLRepaymentPageScreen({super.key});

  @override
  ConsumerState<BNPLRepaymentPageScreen> createState() => _BNPLRepaymentPageScreenState();
}

class _BNPLRepaymentPageScreenState extends ConsumerState<BNPLRepaymentPageScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchText = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchText = _searchController.text;
      });
    });
  }

  @override
void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Helper to format currency
  String _formatCurrency(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or Dollar
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  // Helper to format date
  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  // Helper to get status color
  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending':
        return Colors.orange;
      case 'Paid':
        return Colors.green;
      case 'Overdue':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final repaymentsAsyncValue = ref.watch(bnplRepaymentsProvider);

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('BNPL Repayments', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by Loan ID or Status',
                hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: textColor),
                filled: true,
                fillColor: backgroundColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(bnplRepaymentsProvider.future),
        color: accentColor, // Spinner color
        backgroundColor: cardColor, // Background of the refresh indicator
        child: repaymentsAsyncValue.when(
          data: (repayments) {
            final filteredRepayments = repayments.where((repayment) {
              final lowerCaseSearchText = _searchText.toLowerCase();
              return repayment.loanId.toLowerCase().contains(lowerCaseSearchText) ||
                  repayment.status.toLowerCase().contains(lowerCaseSearchText);
            }).toList();

            if (filteredRepayments.isEmpty) {
              return Center(
                child: Text(
                  _searchText.isEmpty ? 'No repayments found.' : 'No matching repayments.',
                  style: const TextStyle(color: textColor, fontSize: 18),
                ),
              );
            }

            return ListView.builder(
              itemCount: filteredRepayments.length,
              itemBuilder: (context, index) {
                final repayment = filteredRepayments[index];
                return Card(
                  color: cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Loan ID: ${repayment.loanId}',
                              style: const TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: _getStatusColor(repayment.status),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                repayment.status,
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Amount: ${_formatCurrency(repayment.amount, repayment.currency)}',
                          style: const TextStyle(color: textColor, fontSize: 14),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Due Date: ${_formatDate(repayment.dueDate)}',
                          style: const TextStyle(color: textColor, fontSize: 14),
                        ),
                        if (repayment.paidDate != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4.0),
                            child: Text(
                              'Paid Date: ${_formatDate(repayment.paidDate!)}',
                              style: const TextStyle(color: textColor, fontSize: 14),
                            ),
                          ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: ElevatedButton(
                            onPressed: () {
                              // Implement view details logic
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('View details for ${repayment.loanId}')),
                              );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: accentColor, // Button background color
                              foregroundColor: Colors.white, // Button text color
                            ),
                            child: const Text('View Details'),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
          error: (error, stack) => Center(
            child: Text('Error: $error', style: const TextStyle(color: Colors.red, fontSize: 16)),
          ),
        ),
      ),
    );
  }
}
