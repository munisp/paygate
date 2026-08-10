import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

final _searchQueryProvider = StateProvider<String>((ref) => '');

// Define a placeholder data model for Subscription
class Subscription {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final String status;
  final DateTime startDate;
  final DateTime endDate;

  Subscription({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.status,
    required this.startDate,
    required this.endDate,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) {
    return Subscription(
      id: json['id'] as String,
      name: json['name'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
    );
  }
}

// Define the Riverpod provider for fetching subscriptions
final subscriptionsProvider = FutureProvider.autoDispose<List<Subscription>>((ref) async {
  final searchQuery = ref.watch(_searchQueryProvider);

  final api = ref.read(apiServiceProvider);
  try {
    // Placeholder tRPC API call for listing subscriptions
        final response = await api.get("/trpc/subscriptions.list", params: searchQuery.isNotEmpty ? {"search": searchQuery} : null);
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List).map((e) => Subscription.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    // In a real app, you'd handle errors more gracefully
    throw Exception('Failed to load subscriptions: $e');
  }
});

class SubscriptionsPageScreen extends ConsumerStatefulWidget {
  const SubscriptionsPageScreen({super.key});

  @override
  ConsumerState<SubscriptionsPageScreen> createState() => _SubscriptionsPageScreenState();
}

class _SubscriptionsPageScreenState extends ConsumerState<SubscriptionsPageScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(_searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subscriptionsAsyncValue = ref.watch(subscriptionsProvider);
    final _searchQuery = ref.watch(_searchQueryProvider);


    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          decoration: const InputDecoration(
            hintText: "Search subscriptions...",
            hintStyle: TextStyle(color: Color(0xFFf1f5f9)),
            border: InputBorder.none,
          ),
          style: const TextStyle(color: Color(0xFFf1f5f9)),
        ),
        backgroundColor: const Color(0xFF0f172a),
      ),
      backgroundColor: const Color(0xFF0f172a),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(subscriptionsProvider.future),
        child: subscriptionsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, stack) => Center(child: Text("Error: $err", style: TextStyle(color: Color(0xFFf1f5f9)))),
          data: (subscriptions) {
            final displayedSubscriptions = subscriptions.where((sub) => sub.name.toLowerCase().contains(_searchQuery.toLowerCase())).toList();

            if (displayedSubscriptions.isEmpty) {
              return const Center(child: Text("No subscriptions found.", style: TextStyle(color: Color(0xFFf1f5f9))));
            }
            return ListView.builder(
              itemCount: displayedSubscriptions.length,
              itemBuilder: (context, index) {
                final subscription = displayedSubscriptions[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(subscription.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          Text("Amount: ${_formatAmount(subscription.amount, subscription.currency)}", style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Text("Status: ${subscription.status}", style: TextStyle(color: _getStatusColor(subscription.status))),
                          Text("Start Date: ${_formatDate(subscription.startDate)}", style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Text("End Date: ${_formatDate(subscription.endDate)}", style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showEditSubscriptionDialog(context, ref, subscription),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _confirmDeleteSubscription(context, ref, subscription.id),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateSubscriptionDialog(context, ref),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    String symbol = currency == 'NGN' ? '₦' : '$';
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}/${date.year}';
  }

  Future<void> _showCreateSubscriptionDialog(BuildContext context, WidgetRef ref) async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    String? selectedCurrency = 'USD'; // Default currency
    String? selectedStatus = 'active'; // Default status

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Create Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
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
              DropdownButtonFormField<String>(
                value: selectedCurrency,
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                items: <String>['USD', 'NGN'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedCurrency = newValue;
                },
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
                items: <String>['active', 'inactive', 'pending'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedStatus = newValue;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty && amountController.text.isNotEmpty && selectedCurrency != null && selectedStatus != null) {
                try {
                  // Placeholder tRPC API call for creating a subscription
                  await ref.read(apiServiceProvider).post(
                    '/trpc/subscriptions.create',
                    body: {
                      'name': nameController.text,
                      'amount': double.parse(amountController.text),
                      'currency': selectedCurrency,
                      'status': selectedStatus,
                      'startDate': DateTime.now().toIso8601String(),
                      'endDate': DateTime.now().add(const Duration(days: 365)).toIso8601String(), // Example: 1 year subscription
                    },
                  );
                  ref.refresh(subscriptionsProvider); // Refresh the list after creation
                  Navigator.pop(context);
                } catch (e) {
                  // Handle error, e.g., show a SnackBar
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create subscription: $e', style: TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.red),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  Future<void> _showEditSubscriptionDialog(BuildContext context, WidgetRef ref, Subscription subscription) async {
    final TextEditingController nameController = TextEditingController(text: subscription.name);
    final TextEditingController amountController = TextEditingController(text: subscription.amount.toString());
    String? selectedCurrency = subscription.currency;
    String? selectedStatus = subscription.status;

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Edit Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
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
              DropdownButtonFormField<String>(
                value: selectedCurrency,
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                items: <String>['USD', 'NGN'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedCurrency = newValue;
                },
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
                items: <String>['active', 'inactive', 'pending'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  selectedStatus = newValue;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty && amountController.text.isNotEmpty && selectedCurrency != null && selectedStatus != null) {
                try {
                  // Placeholder tRPC API call for updating a subscription
                  await ref.read(apiServiceProvider).post(
                    '/trpc/subscriptions.update',
                    body: {
                      'id': subscription.id,
                      'name': nameController.text,
                      'amount': double.parse(amountController.text),
                      'currency': selectedCurrency,
                      'status': selectedStatus,
                    },
                  );
                  ref.refresh(subscriptionsProvider); // Refresh the list after update
                  Navigator.pop(context);
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update subscription: $e', style: TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.red),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteSubscription(BuildContext context, WidgetRef ref, String subscriptionId) async {
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Delete Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Are you sure you want to delete this subscription?', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              try {
                // Placeholder tRPC API call for deleting a subscription
                await ref.read(apiServiceProvider).post(
                  '/trpc/subscriptions.delete',
                  body: {'id': subscriptionId},
                );
                ref.refresh(subscriptionsProvider); // Refresh the list after deletion
                Navigator.pop(context, true);
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to delete subscription: $e', style: TextStyle(color: Color(0xFFf1f5f9))), backgroundColor: Colors.red),
                );
                Navigator.pop(context, false);
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }
}