import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dark theme colors
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

// Dummy data model for EMI Checkout details
class EMICheckoutDetails {
  final String id;
  final String merchantName;
  final double amount;
  final String currency;
  final String status;
  final DateTime createdAt;

  EMICheckoutDetails({
    required this.id,
    required this.merchantName,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory EMICheckoutDetails.fromJson(Map<String, dynamic> json) {
    return EMICheckoutDetails(
      id: json["id"],
      merchantName: json["merchantName"],
      amount: (json["amount"] as num).toDouble(),
      currency: json["currency"],
      status: json["status"],
      createdAt: DateTime.parse(json["createdAt"]),
    );
  }
}

// Provider for EMI Checkout details
final emiCheckoutDetailsProvider = FutureProvider.autoDispose<EMICheckoutDetails>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call for fetching EMI Checkout details
  // Replace 'emi.getCheckoutDetails' with the actual tRPC procedure
  // For demonstration, returning dummy data.
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  if (true) { // Simulate successful data fetch
    return EMICheckoutDetails(
      id: 'EMI-12345',
      merchantName: 'Example Merchant',
      amount: 1500.75,
      currency: 'NGN',
      status: 'pending',
      createdAt: DateTime.now().subtract(const Duration(days: 2)),
    );
  } else { // Simulate error state
    throw Exception('Failed to load EMI Checkout details');
  }
});

class EMICheckoutScreen extends ConsumerStatefulWidget {
  const EMICheckoutScreen({super.key});

  @override
  ConsumerState<EMICheckoutScreen> createState() => _EMICheckoutScreenState();
}

class _EMICheckoutScreenState extends ConsumerState<EMICheckoutScreen> {
  Future<void> _refreshData() async {
    ref.invalidate(emiCheckoutDetailsProvider);
    await ref.read(emiCheckoutDetailsProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final emiCheckoutAsyncValue = ref.watch(emiCheckoutDetailsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('EMI Checkout', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: _accentColor,
        child: emiCheckoutAsyncValue.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: _accentColor),
          ),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.red)),
          ),
          data: (details) => ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              _buildDetailCard(
                context,
                title: 'Checkout ID',
                value: details.id,
              ),
              _buildDetailCard(
                context,
                title: 'Merchant Name',
                value: details.merchantName,
              ),
              _buildDetailCard(
                context,
                title: 'Amount',
                value: _formatAmount(details.amount, details.currency),
              ),
              _buildDetailCard(
                context,
                title: 'Status',
                value: details.status,
                badgeColor: _getStatusColor(details.status),
              ),
              _buildDetailCard(
                context,
                title: 'Created At',
                value: _formatDate(details.createdAt),
              ),
              // Action buttons (example)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16.0),
                child: ElevatedButton(
                  onPressed: () {
                    // Implement confirm action
                    _showConfirmationDialog(context, 'Confirm EMI', 'Are you sure you want to confirm this EMI?');
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _accentColor,
                    foregroundColor: _textColor,
                    padding: const EdgeInsets.symmetric(vertical: 12.0),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
                  ),
                  child: const Text('Confirm EMI'),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8.0),
                child: OutlinedButton(
                  onPressed: () {
                    // Implement cancel action
                    _showConfirmationDialog(context, 'Cancel EMI', 'Are you sure you want to cancel this EMI?');
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.redAccent,
                    side: const BorderSide(color: Colors.redAccent),
                    padding: const EdgeInsets.symmetric(vertical: 12.0),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
                  ),
                  child: const Text('Cancel EMI'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailCard(BuildContext context, {required String title, required String value, Color? badgeColor}) {
    return Card(
      color: _cardColor,
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14.0),
            ),
            const SizedBox(height: 4.0),
            Row(
              children: [
                if (badgeColor != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                    decoration: BoxDecoration(
                      color: badgeColor,
                      borderRadius: BorderRadius.circular(4.0),
                    ),
                    child: Text(
                      value,
                      style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                    ),
                  ) 
                else
                  Expanded(
                    child: Text(
                      value,
                      style: const TextStyle(color: _textColor, fontSize: 16.0, fontWeight: FontWeight.bold),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : (currency == 'USD' ? '$' : '');
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'approved':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      case 'completed':
        return _accentColor;
      default:
        return Colors.grey;
    }
  }

  Future<void> _showConfirmationDialog(BuildContext context, String title, String content) async {
    return showDialog<void>(
      context: context,
      barrierDismissible: false, // User must tap button!
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text(title, style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text(content, style: const TextStyle(color: _textColor)),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Confirm', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                // Perform the action (e.g., call mutation API)
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
