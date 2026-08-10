import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Placeholder for VoicePayment model
class VoicePayment {
  final String id;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime transactionDate;
  final String status;
  final String description;

  VoicePayment({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.transactionDate,
    required this.status,
    required this.description,
  });

  factory VoicePayment.fromJson(Map<String, dynamic> json) {
    return VoicePayment(
      id: json['id'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      transactionDate: DateTime.parse(json['transactionDate']),
      status: json['status'],
      description: json['description'] ?? 'No description provided',
    );
  }
}

// StateNotifier for managing VoicePayments data
class VoicePaymentsNotifier extends StateNotifier<AsyncValue<List<VoicePayment>>> {
  final ApiService apiService;

  VoicePaymentsNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchVoicePayments();
  }

  Future<void> fetchVoicePayments() async {
    try {
      state = const AsyncValue.loading();
      // Mock data for demonstration
      await Future.delayed(const Duration(seconds: 1));
      final response = [
        {'id': '1', 'customerName': 'Alice Smith', 'amount': 1500.00, 'currency': 'NGN', 'transactionDate': '2026-05-15T10:00:00Z', 'status': 'completed', 'description': 'Payment for goods'},
        {'id': '2', 'customerName': 'Bob Johnson', 'amount': 25.50, 'currency': 'USD', 'transactionDate': '2026-05-14T14:30:00Z', 'status': 'pending', 'description': 'Subscription fee'},
        {'id': '3', 'customerName': 'Charlie Brown', 'amount': 100.00, 'currency': 'EUR', 'transactionDate': '2026-05-13T09:15:00Z', 'status': 'failed', 'description': 'Service payment'},
        {'id': '4', 'customerName': 'Diana Prince', 'amount': 5000.00, 'currency': 'NGN', 'transactionDate': '2026-05-12T11:00:00Z', 'status': 'completed', 'description': 'Online purchase'},
        {'id': '5', 'customerName': 'Eve Adams', 'amount': 75.20, 'currency': 'USD', 'transactionDate': '2026-05-11T16:45:00Z', 'status': 'completed', 'description': 'Consulting fee'},
      ];
      // In a real scenario, you would use apiService.get('/trpc/voicePayments.list');
      final List<VoicePayment> payments = (response as List)
          .map((item) => VoicePayment.fromJson(item))
          .toList();
      state = AsyncValue.data(payments);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> deleteVoicePayment(String id) async {
    try {
      // Optimistically update UI
      state.whenData((payments) {
        state = AsyncValue.data(payments.where((payment) => payment.id != id).toList());
      });
      // In a real scenario, you would use apiService.post('/trpc/voicePayments.delete', body: {'id': id});
      await Future.delayed(const Duration(milliseconds: 500)); // Simulate API call
      // If API call fails, revert the optimistic update and show error
      // For now, assume success
    } catch (e, st) {
      // Revert optimistic update if needed
      fetchVoicePayments(); // Re-fetch to ensure data consistency
      state = AsyncValue.error(e, st);
    }
  }
}

final voicePaymentsProvider = StateNotifierProvider<
    VoicePaymentsNotifier, AsyncValue<List<VoicePayment>>>((ref) {
  return VoicePaymentsNotifier(ref.read(apiServiceProvider));
});

class VoicePaymentsScreen extends ConsumerStatefulWidget {
  const VoicePaymentsScreen({super.key});

  @override
  ConsumerState<VoicePaymentsScreen> createState() => _VoicePaymentsScreenState();
}

class _VoicePaymentsScreenState extends ConsumerState<VoicePaymentsScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final voicePaymentsAsyncValue = ref.watch(voicePaymentsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'Voice Payments',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (query) {
                setState(() {
                  _searchQuery = query;
                });
              },
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                hintText: 'Search by customer name...',
                hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
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
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(voicePaymentsProvider.notifier).fetchVoicePayments(),
              child: voicePaymentsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9)))),
                data: (payments) {
                  final filteredPayments = payments.where((payment) {
                    return payment.customerName.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (filteredPayments.isEmpty) {
                    return const Center(
                      child: Text(
                        'No voice payments found.',
                        style: TextStyle(color: Color(0xFFf1f5f9)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: filteredPayments.length,
                    itemBuilder: (context, index) {
                      final payment = filteredPayments[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: ListTile(
                          title: Text(payment.customerName, style: const TextStyle(color: Color(0xFFf1f5f9))), // Light text
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _formatAmount(payment.amount, payment.currency),
                                style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.9), fontWeight: FontWeight.bold),
                              ),
                              _buildStatusBadge(payment.status),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                DateFormat('MMM d, yyyy').format(payment.transactionDate),
                                style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                              ),
                              IconButton(
                                icon: const Icon(Icons.info_outline, color: Color(0xFF6366f1)),
                                onPressed: () {
                                  _showPaymentDetails(context, payment);
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () {
                                  _confirmDelete(context, payment);
                                },
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
          ),
        ],
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
        status.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: _getCurrencySymbol(currency));
    return format.format(amount);
  }

  String _getCurrencySymbol(String currency) {
    switch (currency.toUpperCase()) {
      case 'NGN':
        return '₦';
      case 'USD':
        return '$';
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      default:
        return currency;
    }
  }

  void _showPaymentDetails(BuildContext context, VoicePayment payment) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Payment Details', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('ID: ${payment.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Customer: ${payment.customerName}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Amount: ${_formatAmount(payment.amount, payment.currency)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Status: ${payment.status}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Date: ${DateFormat('MMM d, yyyy HH:mm').format(payment.transactionDate)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Description: ${payment.description}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Close', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(BuildContext context, VoicePayment payment) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Confirm Delete', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete the payment from ${payment.customerName}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                ref.read(voicePaymentsProvider.notifier).deleteVoicePayment(payment.id);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}