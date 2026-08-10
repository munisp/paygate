import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Theme Colors
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

// Data model for a transaction
class Transaction {
  final String id;
  final String type;
  final String currency;
  final double amount;
  final double rate;
  final DateTime date;
  final String status;

  Transaction({
    required this.id,
    required this.type,
    required this.currency,
    required this.amount,
    required this.rate,
    required this.date,
    required this.status,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    return Transaction(
      id: json['id'],
      type: json['type'],
      currency: json['currency'],
      amount: json['amount'].toDouble(),
      rate: json['rate'].toDouble(),
      date: DateTime.parse(json['date']),
      status: json['status'],
    );
  }
}

// Data model for the dashboard
class FXDashboardData {
  final double totalFxBalance;
  final List<Transaction> recentTransactions;

  FXDashboardData({
    required this.totalFxBalance,
    required this.recentTransactions,
  });

  factory FXDashboardData.fromJson(Map<String, dynamic> json) {
    return FXDashboardData(
      totalFxBalance: json['totalFxBalance'].toDouble(),
      recentTransactions: (json['recentTransactions'] as List)
          .map((e) => Transaction.fromJson(e))
          .toList(),
    );
  }
}

// Riverpod provider for fetching FX Dashboard data
final fxDashboardDataProvider = FutureProvider<FXDashboardData>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/fx.getDashboardData');
  return FXDashboardData.fromJson(response);
});

class FXDashboardScreen extends ConsumerStatefulWidget {
  const FXDashboardScreen({super.key});

  @override
  ConsumerState<FXDashboardScreen> createState() => _FXDashboardScreenState();
}

class _FXDashboardScreenState extends ConsumerState<FXDashboardScreen> {
  Future<void> _refreshData() async {
    ref.invalidate(fxDashboardDataProvider);
    await ref.read(fxDashboardDataProvider.future);
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'USD' ? '\$' : '₦');
    return format.format(amount);
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'Completed':
        color = Colors.green;
        break;
      case 'Pending':
        color = Colors.orange;
        break;
      case 'Failed':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fxDashboardDataAsync = ref.watch(fxDashboardDataProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('FX Dashboard', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: _accentColor,
        child: fxDashboardDataAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (data) {
            if (data.recentTransactions.isEmpty && data.totalFxBalance == 0.0) {
              return Center(
                child: Text(
                  'No FX data available.',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Total FX Balance Card
                Card(
                  color: _cardColor,
                  margin: const EdgeInsets.only(bottom: 16.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Total FX Balance',
                          style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 16),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _formatAmount(data.totalFxBalance, 'USD'), // Assuming USD for total balance display
                          style: const TextStyle(color: _textColor, fontSize: 28, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Recent Transactions',
                  style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                // Recent Transactions List
                ...data.recentTransactions.map((transaction) {
                  return Card(
                    color: _cardColor,
                    margin: const EdgeInsets.only(bottom: 8.0),
                    child: ListTile(
                      leading: Icon(
                        transaction.type == 'Buy' ? Icons.arrow_downward : Icons.arrow_upward,
                        color: transaction.type == 'Buy' ? Colors.green : Colors.red,
                      ),
                      title: Text(
                        '${transaction.type} ${transaction.currency}',
                        style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${_formatAmount(transaction.amount, transaction.currency)} @ ${transaction.rate}',
                            style: TextStyle(color: _textColor.withOpacity(0.8)),
                          ),
                          Text(
                            DateFormat('MMM d, yyyy - hh:mm a').format(transaction.date.toLocal()),
                            style: TextStyle(color: _textColor.withOpacity(0.6), fontSize: 12),
                          ),
                        ],
                      ),
                      trailing: _buildStatusBadge(transaction.status),
                      onTap: () {
                        // Action button / View Details
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('View details for transaction ${transaction.id}')),
                        );
                      },
                    ),
                  );
                }).toList(),
              ],
            );
          },
        ),
      ),
    );
  }
}