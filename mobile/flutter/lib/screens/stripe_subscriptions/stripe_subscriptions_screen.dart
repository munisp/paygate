import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a simple subscription model for demonstration
class Subscription {
  final String id;
  final String customerName;
  final String planName;
  final double amount;
  final String currency;
  final String status;
  final DateTime startDate;
  final DateTime endDate;

  Subscription({
    required this.id,
    required this.customerName,
    required this.planName,
    required this.amount,
    required this.currency,
    required this.status,
    required this.startDate,
    required this.endDate,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) {
    return Subscription(
      id: json['id'] as String,
      customerName: json['customerName'] as String,
      planName: json['planName'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
    );
  }
}

// Define a provider for the subscriptions list
final stripeSubscriptionsProvider = FutureProvider.family<List<Subscription>, Map<String, dynamic>>((ref, params) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/stripeSubscriptions.list', params: params);
  // return (response.data as List).map((e) => Subscription.fromJson(e)).toList();

  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1));
  final mockData = [
    {
      'id': 'sub_001',
      'customerName': 'Alice Smith',
      'planName': 'Premium Monthly',
      'amount': 25.00,
      'currency': 'USD',
      'status': 'active',
      'startDate': '2023-01-15T00:00:00Z',
      'endDate': '2024-01-15T00:00:00Z',
    },
    {
      'id': 'sub_002',
      'customerName': 'Bob Johnson',
      'planName': 'Standard Yearly',
      'amount': 12000.00,
      'currency': 'NGN',
      'status': 'cancelled',
      'startDate': '2022-03-01T00:00:00Z',
      'endDate': '2023-03-01T00:00:00Z',
    },
    {
      'id': 'sub_003',
      'customerName': 'Charlie Brown',
      'planName': 'Basic Monthly',
      'amount': 10.00,
      'currency': 'USD',
      'status': 'pending',
      'startDate': '2024-05-01T00:00:00Z',
      'endDate': '2025-05-01T00:00:00Z',
    },
    {
      'id': 'sub_004',
      'customerName': 'Diana Prince',
      'planName': 'Enterprise',
      'amount': 500.00,
      'currency': 'USD',
      'status': 'active',
      'startDate': '2023-11-01T00:00:00Z',
      'endDate': '2024-11-01T00:00:00Z',
    },
  ];

  final query = (params['search'] as String? ?? '').toLowerCase();
  final filteredData = mockData.where((sub) {
    return sub['customerName'].toString().toLowerCase().contains(query) ||
           sub['planName'].toString().toLowerCase().contains(query);
  }).toList();

  return filteredData.map((e) => Subscription.fromJson(e)).toList();
});

// Provider for creating a subscription
final createSubscriptionProvider = FutureProvider.family<void, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  // await api.post('/trpc/stripeSubscriptions.create', body: data);
  await Future.delayed(const Duration(seconds: 1)); // Simulate API call
  ref.invalidate(stripeSubscriptionsProvider); // Refresh list after creation
});

// Provider for updating a subscription
final updateSubscriptionProvider = FutureProvider.family<void, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  // await api.post('/trpc/stripeSubscriptions.update', body: data);
  await Future.delayed(const Duration(seconds: 1)); // Simulate API call
  ref.invalidate(stripeSubscriptionsProvider); // Refresh list after update
});

// Provider for deleting a subscription
final deleteSubscriptionProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  // await api.post('/trpc/stripeSubscriptions.delete', body: {'id': id});
  await Future.delayed(const Duration(seconds: 1)); // Simulate API call
  ref.invalidate(stripeSubscriptionsProvider); // Refresh list after deletion
});

class StripeSubscriptionsScreen extends ConsumerStatefulWidget {
  const StripeSubscriptionsScreen({super.key});

  @override
  ConsumerState<StripeSubscriptionsScreen> createState() => _StripeSubscriptionsScreenState();
}

class _StripeSubscriptionsScreenState extends ConsumerState<StripeSubscriptionsScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final subscriptionsAsyncValue = ref.watch(stripeSubscriptionsProvider({'search': _searchController.text}));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Stripe Subscriptions', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0),
              child: TextField(
                controller: _searchController,
                onChanged: (value) {
                  setState(() {}); // Rebuild to trigger provider refresh with new search query
                },
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  hintText: 'Search subscriptions...',
                  hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(stripeSubscriptionsProvider({'search': _searchController.text}).future),
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: subscriptionsAsyncValue.when(
          data: (subscriptions) {
            if (subscriptions.isEmpty) {
              return const Center(
                child: Text(
                  'No subscriptions found.',
                  style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(8.0),
              itemCount: subscriptions.length,
              itemBuilder: (context, index) {
                final subscription = subscriptions[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(vertical: 4.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subscription.customerName,
                          style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Plan: ${subscription.planName}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text(
                              'Amount: ${subscription.currency == 'NGN' ? '₦' : '$'}${subscription.amount.toStringAsFixed(2)}',
                              style: const TextStyle(color: Color(0xFFf1f5f9)),
                            ),
                            const Spacer(),
                            _buildStatusBadge(subscription.status),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Starts: ${subscription.startDate.toLocal().toIso8601String().split('T')[0]}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Ends: ${subscription.endDate.toLocal().toIso8601String().split('T')[0]}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => _showEditSubscriptionDialog(context, subscription),
                              child: const Text('Edit', style: TextStyle(color: Color(0xFF6366f1))),
                            ),
                            TextButton(
                              onPressed: () => _showDeleteConfirmationDialog(context, subscription.id),
                              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
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
            child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateSubscriptionDialog(context),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    String text;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        text = 'Active';
        break;
      case 'cancelled':
        color = Colors.red;
        text = 'Cancelled';
        break;
      case 'pending':
        color = Colors.orange;
        text = 'Pending';
        break;
      default:
        color = Colors.grey;
        text = 'Unknown';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  void _showCreateSubscriptionDialog(BuildContext context) {
    final customerNameController = TextEditingController();
    final planNameController = TextEditingController();
    final amountController = TextEditingController();
    final currencyController = TextEditingController(text: 'USD');
    final statusController = TextEditingController(text: 'pending');
    DateTime? startDate;
    DateTime? endDate;

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Customer Name'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: planNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Plan Name'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: _inputDecoration('Amount'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Currency (USD/NGN)'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Status (active/cancelled/pending)'),
                ),
                const SizedBox(height: 10),
                _buildDatePicker(dialogContext, 'Start Date', startDate, (date) => startDate = date),
                const SizedBox(height: 10),
                _buildDatePicker(dialogContext, 'End Date', endDate, (date) => endDate = date),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                if (customerNameController.text.isNotEmpty &&
                    planNameController.text.isNotEmpty &&
                    amountController.text.isNotEmpty &&
                    startDate != null &&
                    endDate != null) {
                  final newSubscriptionData = {
                    'id': 'sub_${DateTime.now().millisecondsSinceEpoch}', // Mock ID
                    'customerName': customerNameController.text,
                    'planName': planNameController.text,
                    'amount': double.parse(amountController.text),
                    'currency': currencyController.text.toUpperCase(),
                    'status': statusController.text.toLowerCase(),
                    'startDate': startDate!.toIso8601String(),
                    'endDate': endDate!.toIso8601String(),
                  };
                  await ref.read(createSubscriptionProvider(newSubscriptionData).future);
                  Navigator.of(dialogContext).pop();
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditSubscriptionDialog(BuildContext context, Subscription subscription) {
    final customerNameController = TextEditingController(text: subscription.customerName);
    final planNameController = TextEditingController(text: subscription.planName);
    final amountController = TextEditingController(text: subscription.amount.toStringAsFixed(2));
    final currencyController = TextEditingController(text: subscription.currency);
    final statusController = TextEditingController(text: subscription.status);
    DateTime? startDate = subscription.startDate;
    DateTime? endDate = subscription.endDate;

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Customer Name'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: planNameController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Plan Name'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.number,
                  decoration: _inputDecoration('Amount'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Currency (USD/NGN)'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: statusController,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: _inputDecoration('Status (active/cancelled/pending)'),
                ),
                const SizedBox(height: 10),
                _buildDatePicker(dialogContext, 'Start Date', startDate, (date) => startDate = date),
                const SizedBox(height: 10),
                _buildDatePicker(dialogContext, 'End Date', endDate, (date) => endDate = date),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                if (customerNameController.text.isNotEmpty &&
                    planNameController.text.isNotEmpty &&
                    amountController.text.isNotEmpty &&
                    startDate != null &&
                    endDate != null) {
                  final updatedSubscriptionData = {
                    'id': subscription.id,
                    'customerName': customerNameController.text,
                    'planName': planNameController.text,
                    'amount': double.parse(amountController.text),
                    'currency': currencyController.text.toUpperCase(),
                    'status': statusController.text.toLowerCase(),
                    'startDate': startDate!.toIso8601String(),
                    'endDate': endDate!.toIso8601String(),
                  };
                  await ref.read(updateSubscriptionProvider(updatedSubscriptionData).future);
                  Navigator.of(dialogContext).pop();
                }
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String subscriptionId) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this subscription?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                await ref.read(deleteSubscriptionProvider(subscriptionId).future);
                Navigator.of(dialogContext).pop();
              },
            ),
          ],
        );
      },
    );
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
      enabledBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Color(0xFF6366f1)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Color(0xFF6366f1), width: 2),
      ),
      border: const OutlineInputBorder(),
    );
  }

  Widget _buildDatePicker(BuildContext context, String label, DateTime? selectedDate, Function(DateTime) onDateSelected) {
    return Row(
      children: [
        Expanded(
          child: Text(
            '$label: ${selectedDate == null ? 'Select Date' : selectedDate.toLocal().toIso8601String().split('T')[0]}',
            style: const TextStyle(color: Color(0xFFf1f5f9)),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.calendar_today, color: Color(0xFF6366f1)),
          onPressed: () async {
            final DateTime? picked = await showDatePicker(
              context: context,
              initialDate: selectedDate ?? DateTime.now(),
              firstDate: DateTime(2000),
              lastDate: DateTime(2101),
              builder: (BuildContext context, Widget? child) {
                return Theme(
                  data: ThemeData.dark().copyWith(
                    colorScheme: const ColorScheme.dark(
                      primary: Color(0xFF6366f1), // header background color
                      onPrimary: Color(0xFFf1f5f9), // header text color
                      onSurface: Color(0xFFf1f5f9), // body text color
                      surface: Color(0xFF1e293b), // dialog background
                    ),
                    textButtonTheme: TextButtonThemeData(
                      style: TextButton.styleFrom(
                        foregroundColor: const Color(0xFF6366f1), // button text color
                      ),
                    ),
                  ),
                  child: child!,
                );
              },
            );
            if (picked != null && picked != selectedDate) {
              setState(() {
                onDateSelected(picked);
              });
            }
          },
        ),
      ],
    );
  }
}
