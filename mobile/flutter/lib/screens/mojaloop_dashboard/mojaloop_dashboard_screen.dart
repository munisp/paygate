import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Placeholder for Mojaloop Dashboard data model
class MojaloopDashboardData {
  final String status;
  final double totalTransactions;
  final String currency;
  final DateTime lastUpdated;
  final int activeParticipants;
  final double averageTransactionValue;

  MojaloopDashboardData({
    required this.status,
    required this.totalTransactions,
    required this.currency,
    required this.lastUpdated,
    required this.activeParticipants,
    required this.averageTransactionValue,
  });

  factory MojaloopDashboardData.fromJson(Map<String, dynamic> json) {
    return MojaloopDashboardData(
      status: json['status'] as String,
      totalTransactions: (json['totalTransactions'] as num).toDouble(),
      currency: json['currency'] as String,
      lastUpdated: DateTime.parse(json['lastUpdated'] as String),
      activeParticipants: json['activeParticipants'] as int,
      averageTransactionValue: (json['averageTransactionValue'] as num).toDouble(),
    );
  }
}

// Placeholder for Mojaloop Transaction data model
class MojaloopTransaction {
  final String id;
  final String type;
  final double amount;
  final String currency;
  final DateTime date;
  final String participant;
  final String status;

  MojaloopTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.currency,
    required this.date,
    required this.participant,
    required this.status,
  });

  factory MojaloopTransaction.fromJson(Map<String, dynamic> json) {
    return MojaloopTransaction(
      id: json['id'] as String,
      type: json['type'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      date: DateTime.parse(json['date'] as String),
      participant: json['participant'] as String,
      status: json['status'] as String,
    );
  }
}

// Provider for fetching Mojaloop Dashboard data
final mojaloopDashboardProvider = FutureProvider.autoDispose<MojaloopDashboardData>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Replace with actual tRPC call: api.get('/trpc/mojaloop.dashboard', params: {});
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Example of an empty state for dashboard data (uncomment to test)
  // return Future.error('No dashboard data available');

  return MojaloopDashboardData(
    status: 'Operational',
    totalTransactions: 1234567.89,
    currency: '₦',
    lastUpdated: DateTime.now(),
    activeParticipants: 42,
    averageTransactionValue: 1500.75,
  );
});

// Provider for fetching recent Mojaloop Transactions
final mojaloopTransactionsProvider = FutureProvider.autoDispose<List<MojaloopTransaction>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Replace with actual tRPC call: api.get('/trpc/mojaloop.transactions.list', params: {});
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Example of an empty state for transactions (uncomment to test)
  // return [];

  return [
    MojaloopTransaction(
      id: 'txn_001',
      type: 'Transfer',
      amount: 5000.00,
      currency: '₦',
      date: DateTime.now().subtract(const Duration(hours: 1)),
      participant: 'Alice',
      status: 'Completed',
    ),
    MojaloopTransaction(
      id: 'txn_002',
      type: 'Deposit',
      amount: 100.50,
      currency: '\$',
      date: DateTime.now().subtract(const Duration(days: 1)),
      participant: 'Bob',
      status: 'Pending',
    ),
    MojaloopTransaction(
      id: 'txn_003',
      type: 'Withdrawal',
      amount: 250.00,
      currency: '₦',
      date: DateTime.now().subtract(const Duration(days: 2)),
      participant: 'Charlie',
      status: 'Failed',
    ),
  ];
});

class MojaloopDashboardScreen extends ConsumerStatefulWidget {
  const MojaloopDashboardScreen({super.key});

  @override
  ConsumerState<MojaloopDashboardScreen> createState() => _MojaloopDashboardScreenState();
}

class _MojaloopDashboardScreenState extends ConsumerState<MojaloopDashboardScreen> {
  Future<void> _refreshData() async {
    ref.invalidate(mojaloopDashboardProvider);
    ref.invalidate(mojaloopTransactionsProvider);
    await Future.wait([
      ref.read(mojaloopDashboardProvider.future),
      ref.read(mojaloopTransactionsProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final dashboardDataAsync = ref.watch(mojaloopDashboardProvider);
    final transactionsAsync = ref.watch(mojaloopTransactionsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'Mojaloop Dashboard',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            dashboardDataAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
              error: (err, stack) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: Color(0xFFf1f5f9), size: 48),
                    const SizedBox(height: 16),
                    Text(
                      'Failed to load dashboard summary: $err',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _refreshData,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF6366f1), // Accent color
                        foregroundColor: const Color(0xFFf1f5f9), // Light text
                      ),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (data) {
                // The FutureProvider will return an error if no data, so `data` will not be null here on success.
                // This check is more for logical completeness if the API could return an empty but successful response.
                // For now, assuming successful data fetch means `data` is not null.
                return Column(
                  children: [
                    _buildDashboardCard(
                      title: 'Overall Status',
                      value: data.status,
                      context: context,
                      statusBadge: true,
                    ),
                    _buildDashboardCard(
                      title: 'Total Transactions',
                      value: '${data.currency}${NumberFormat('#,##0.00').format(data.totalTransactions)}',
                      context: context,
                    ),
                    _buildDashboardCard(
                      title: 'Active Participants',
                      value: '${data.activeParticipants}',
                      context: context,
                    ),
                    _buildDashboardCard(
                      title: 'Average Transaction Value',
                      value: '${data.currency}${NumberFormat('#,##0.00').format(data.averageTransactionValue)}',
                      context: context,
                    ),
                    _buildDashboardCard(
                      title: 'Last Updated',
                      value: DateFormat('MMM d, yyyy HH:mm').format(data.lastUpdated.toLocal()),
                      context: context,
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16.0),
                      child: ElevatedButton(
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('View Full Dashboard (Placeholder)')),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366f1), // Accent color
                          foregroundColor: const Color(0xFFf1f5f9), // Light text
                          padding: const EdgeInsets.symmetric(vertical: 12.0),
                        ),
                        child: const Text('View Full Dashboard', style: TextStyle(fontSize: 16)),
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 24),
            Text(
              'Recent Transactions',
              style: TextStyle(
                color: Color(0xFFf1f5f9),
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            transactionsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
              error: (err, stack) => Center(
                child: Text(
                  'Failed to load transactions: $err',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                ),
              ),
              data: (transactions) {
                if (transactions.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Text(
                        'No recent transactions found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                      ),
                    ),
                  );
                }
                return Column(
                  children: transactions.map((txn) => _buildTransactionCard(txn, context)).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDashboardCard({
    required String title,
    required String value,
    required BuildContext context,
    bool statusBadge = false,
  }) {
    return Card(
      color: const Color(0xFF1e293b), // Card background
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: Color(0xFFf1f5f9),
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8.0),
            Row(
              children: [
                if (statusBadge) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: value == 'Operational' ? Colors.green : Colors.red,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      value,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                if (!statusBadge) // Only show value if not a status badge
                  Text(
                    value,
                    style: const TextStyle(
                      color: Color(0xFFf1f5f9),
                      fontSize: 20,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTransactionCard(MojaloopTransaction transaction, BuildContext context) {
    Color statusColor;
    switch (transaction.status) {
      case 'Completed':
        statusColor = Colors.green;
        break;
      case 'Pending':
        statusColor = Colors.orange;
        break;
      case 'Failed':
        statusColor = Colors.red;
        break;
      default:
        statusColor = Colors.grey;
    }

    return Card(
      color: const Color(0xFF1e293b),
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      child: ListTile(
        leading: Icon(
          transaction.type == 'Transfer' ? Icons.arrow_forward : Icons.arrow_back,
          color: const Color(0xFFf1f5f9),
        ),
        title: Text(
          '${transaction.type} - ${transaction.participant}',
          style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
        ),
        subtitle: Text(
          '${DateFormat('MMM d, HH:mm').format(transaction.date.toLocal())} | ID: ${transaction.id}',
          style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${transaction.currency}${NumberFormat('#,##0.00').format(transaction.amount)}',
              style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: statusColor,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                transaction.status,
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
          ],
        ),
        onTap: () {
          // TODO: Implement view transaction details dialog/page
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('View details for transaction ${transaction.id} (Placeholder)')),
          );
        },
      ),
    );
  }
}
