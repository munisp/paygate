import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Placeholder for analytics data model
class AnalyticsData {
  final double totalRevenue;
  final int totalTransactions;
  final double averageTransactionValue;
  final String currency;
  final List<TransactionSummary> recentTransactions;

  AnalyticsData({
    required this.totalRevenue,
    required this.totalTransactions,
    required this.averageTransactionValue,
    this.currency = '₦',
    required this.recentTransactions,
  });

  factory AnalyticsData.fromJson(Map<String, dynamic> json) {
    var list = json['recentTransactions'] as List;
    List<TransactionSummary> transactionsList = list.map((i) => TransactionSummary.fromJson(i)).toList();

    return AnalyticsData(
      totalRevenue: (json['totalRevenue'] as num).toDouble(),
      totalTransactions: json['totalTransactions'] as int,
      averageTransactionValue: (json['averageTransactionValue'] as num).toDouble(),
      currency: json['currency'] as String? ?? '₦',
      recentTransactions: transactionsList,
    );
  }
}

class TransactionSummary {
  final String id;
  final String customerName;
  final double amount;
  final String status;
  final DateTime transactionDate;

  TransactionSummary({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.status,
    required this.transactionDate,
  });

  factory TransactionSummary.fromJson(Map<String, dynamic> json) {
    return TransactionSummary(
      id: json['id'] as String,
      customerName: json['customerName'] as String,
      amount: (json['amount'] as num).toDouble(),
      status: json['status'] as String,
      transactionDate: DateTime.parse(json['transactionDate'] as String),
    );
  }
}

// State for analytics data
class AnalyticsState {
  final bool isLoading;
  final String? error;
  final AnalyticsData? data;

  AnalyticsState({this.isLoading = false, this.error, this.data});

  AnalyticsState copyWith({bool? isLoading, String? error, AnalyticsData? data}) {
    return AnalyticsState(
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
      data: data ?? this.data,
    );
  }
}

// StateNotifier for managing analytics data
class AnalyticsNotifier extends StateNotifier<AnalyticsState> {
  final ApiService apiService;
  AnalyticsNotifier(this.apiService) : super(AnalyticsState()) {
    fetchAnalyticsData();
  }

  Future<void> fetchAnalyticsData() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // tRPC API call for merchant analytics dashboard data
      final response = await apiService.get('/trpc/merchantAnalytics.getDashboardData', params: {});
      final analyticsData = AnalyticsData.fromJson(response);
      state = state.copyWith(isLoading: false, data: analyticsData);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

// Provider for AnalyticsNotifier
final analyticsProvider = StateNotifierProvider<AnalyticsNotifier, AnalyticsState>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return AnalyticsNotifier(apiService);
});

class MerchantAnalyticsDashboardScreen extends ConsumerStatefulWidget {
  const MerchantAnalyticsDashboardScreen({super.key});

  @override
  ConsumerState<MerchantAnalyticsDashboardScreen> createState() => _MerchantAnalyticsDashboardScreenState();
}

class _MerchantAnalyticsDashboardScreenState extends ConsumerState<MerchantAnalyticsDashboardScreen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  String _formatCurrency(double amount, String currency) {
    // Use 'en_US' locale for consistent formatting, symbol is passed dynamically
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency, decimalDigits: 2);
    return format.format(amount);
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = _textColor;
    switch (status.toLowerCase()) {
      case 'completed':
        badgeColor = Colors.green.shade700;
        break;
      case 'pending':
        badgeColor = Colors.orange.shade700;
        break;
      case 'failed':
        badgeColor = Colors.red.shade700;
        break;
      default:
        badgeColor = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(12.0),
      ),
      child: Text(
        status,
        style: TextStyle(color: textColor, fontSize: 12.0, fontWeight: FontWeight.bold),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final analyticsState = ref.watch(analyticsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Merchant Analytics Dashboard',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.search, color: _textColor),
            onPressed: () {
              // Placeholder for search/filter functionality. CRUD operations for transactions
              // would typically be handled in a dedicated transaction management screen.
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Search/Filter functionality not yet implemented.')),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(analyticsProvider.notifier).fetchAnalyticsData(),
        child: Builder(
          builder: (context) {
            if (analyticsState.isLoading) {
              return const Center(
                child: CircularProgressIndicator(color: _accentColor),
              );
            } else if (analyticsState.error != null) {
              return Center(
                child: Text(
                  'Error: ${analyticsState.error}',
                  style: const TextStyle(color: Colors.red),
                ),
              );
            } else if (analyticsState.data == null) {
              return Center(
                child: Text(
                  'No analytics data available.',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              );
            } else {
              final data = analyticsState.data!;
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildMetricCard(
                        title: 'Total Revenue',
                        value: _formatCurrency(data.totalRevenue, data.currency),
                        icon: Icons.monetization_on,
                      ),
                      const SizedBox(height: 16.0),
                      _buildMetricCard(
                        title: 'Total Transactions',
                        value: data.totalTransactions.toString(),
                        icon: Icons.receipt,
                      ),
                      const SizedBox(height: 16.0),
                      _buildMetricCard(
                        title: 'Average Transaction Value',
                        value: _formatCurrency(data.averageTransactionValue, data.currency),
                        icon: Icons.trending_up,
                      ),
                      const SizedBox(height: 24.0),
                      Text(
                        'Recent Transactions',
                        style: TextStyle(color: _textColor, fontSize: 18.0, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16.0),
                      _buildRecentTransactionsList(data.recentTransactions, data.currency),
                    ],
                  ),
                ),
              );
            }
          },
        ),
      ),
    );
  }

  Widget _buildMetricCard({required String title, required String value, required IconData icon}) {
    return Card(
      color: _cardColor,
      elevation: 4.0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Icon(icon, color: _accentColor, size: 36.0),
            const SizedBox(width: 16.0),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 16.0),
                ),
                const SizedBox(height: 4.0),
                Text(
                  value,
                  style: const TextStyle(color: _textColor, fontSize: 24.0, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentTransactionsList(List<TransactionSummary> transactions, String currency) {
    if (transactions.isEmpty) {
      return Text(
        'No recent transactions.',
        style: TextStyle(color: _textColor.withOpacity(0.7)),
      );
    }
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: transactions.length,
      itemBuilder: (context, index) {
        final transaction = transactions[index];
        return Card(
          color: _cardColor,
          margin: const EdgeInsets.only(bottom: 8.0),
          elevation: 2.0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
          child: ListTile(
            leading: Icon(Icons.compare_arrows, color: _accentColor),
            title: Text(
              transaction.customerName,
              style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ID: ${transaction.id}',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
                Text(
                  'Date: ${DateFormat('MMM d, yyyy - hh:mm a').format(transaction.transactionDate)}',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              ],
            ),
            trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _formatCurrency(transaction.amount, currency),
                  style: const TextStyle(color: _textColor, fontSize: 16.0, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4.0),
                _buildStatusBadge(transaction.status),
              ],
            ),
            onTap: () {
              // Action button: View details for a specific transaction.
              // Full CRUD for transactions (create, edit, delete) would be implemented
              // in a separate, dedicated transaction management screen.
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Viewing details for transaction ${transaction.id}')),
              );
            },
          ),
        );
      },
    );
  }
}
