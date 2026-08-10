import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date and currency formatting
import '../../services/api_service.dart';

// Define data models for Subscription
class Subscription {
  final String id;
  final String planName;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime startDate;
  final DateTime endDate;
  final String status;

  Subscription({
    required this.id,
    required this.planName,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) {
    return Subscription(
      id: json['id'] as String,
      planName: json['planName'] as String,
      customerName: json['customerName'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      status: json['status'] as String,
    );
  }
}

// Riverpod FutureProvider for fetching subscriptions
final subscriptionsProvider = FutureProvider.autoDispose<List<Subscription>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call for SubscriptionManagement
    // Assuming tRPC router namespace for SubscriptionManagement is 'subscriptions'
    // final response = await api.get('/trpc/subscriptions.list');
    // In a real scenario, you would parse the response into a List<Subscription>
    // For now, return dummy data
    await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
    return [
      Subscription(
        id: '1',
        planName: 'Premium Monthly',
        customerName: 'John Doe',
        amount: 2500.00,
        currency: '₦',
        startDate: DateTime(2023, 1, 1),
        endDate: DateTime(2024, 1, 1),
        status: 'Active',
      ),
      Subscription(
        id: '2',
        planName: 'Standard Yearly',
        customerName: 'Jane Smith',
        amount: 150.00,
        currency: '$',
        startDate: DateTime(2022, 6, 15),
        endDate: DateTime(2023, 6, 15),
        status: 'Expired',
      ),
      Subscription(
        id: '3',
        planName: 'Basic Monthly',
        customerName: 'Peter Jones',
        amount: 500.00,
        currency: '₦',
        startDate: DateTime(2023, 10, 1),
        endDate: DateTime(2024, 10, 1),
        status: 'Pending',
      ),
      Subscription(
        id: '4',
        planName: 'Enterprise',
        customerName: 'Acme Corp',
        amount: 1000.00,
        currency: '$',
        startDate: DateTime(2024, 3, 1),
        endDate: DateTime(2025, 3, 1),
        status: 'Active',
      ),
    ];
  } catch (e) {
    print('Error fetching subscriptions: $e');
    rethrow;
  }
});

class SubscriptionManagementScreen extends ConsumerStatefulWidget {
  const SubscriptionManagementScreen({super.key});

  @override
  ConsumerState<SubscriptionManagementScreen> createState() => _SubscriptionManagementScreenState();
}

class _SubscriptionManagementScreenState extends ConsumerState<SubscriptionManagementScreen> {
  String _searchQuery = '';

  Future<void> _refreshSubscriptions() async {
    ref.invalidate(subscriptionsProvider);
  }

  void _showCreateSubscriptionDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Create New Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
          backgroundColor: const Color(0xFF1e293b),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Plan Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                // Add more fields as needed
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
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                // Implement create logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditSubscriptionDialog(Subscription subscription) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Edit Subscription ${subscription.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
          backgroundColor: const Color(0xFF1e293b),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: TextEditingController(text: subscription.planName),
                  decoration: const InputDecoration(
                    labelText: 'Plan Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: TextEditingController(text: subscription.customerName),
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                // Add more fields as needed
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
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                // Implement save logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(Subscription subscription) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Delete Subscription', style: TextStyle(color: Color(0xFFf1f5f9))),
          backgroundColor: const Color(0xFF1e293b),
          content: Text('Are you sure you want to delete the subscription for ${subscription.customerName} (Plan: ${subscription.planName})?', style: const TextStyle(color: Color(0xFFf1f5f9))),
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
                // Implement delete logic here
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final subscriptionsAsyncValue = ref.watch(subscriptionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription Management', style: TextStyle(color: Color(0xFFf1f5f9)))),
        backgroundColor: const Color(0xFF0f172a),
        actions: [
          IconButton(
            icon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
            onPressed: () async {
              final String? result = await showSearch(
                context: context,
                delegate: _SubscriptionSearchDelegate(ref.read(subscriptionsProvider).value ?? []), // Pass current subscriptions
              );
              if (result != null) {
                setState(() {
                  _searchQuery = result;
                });
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.filter_list, color: Color(0xFFf1f5f9)),
            onPressed: () {
              // Implement filter functionality
            },
          ),
        ],
      ),
      body: Container(
        color: const Color(0xFF0f172a),
        child: RefreshIndicator(
          onRefresh: _refreshSubscriptions,
          color: const Color(0xFF6366f1),
          child: subscriptionsAsyncValue.when(
            data: (subscriptions) {
              final filteredSubscriptions = subscriptions.where((sub) {
                return sub.planName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                       sub.customerName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                       sub.status.toLowerCase().contains(_searchQuery.toLowerCase());
              }).toList();

              if (filteredSubscriptions.isEmpty) {
                return Center(
                  child: Text(
                    _searchQuery.isEmpty ? 'No subscriptions found.' : 'No matching subscriptions found.',
                    style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                  ),
                );
              }
              return ListView.builder(
                itemCount: filteredSubscriptions.length,
                itemBuilder: (context, index) {
                  final subscription = filteredSubscriptions[index];
                  return Card(
                    color: const Color(0xFF1e293b),
                    margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            subscription.planName,
                            style: const TextStyle(
                              color: Color(0xFFf1f5f9),
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Customer: ${subscription.customerName}',
                            style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.8)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Amount: ${_formatCurrency(subscription.amount, subscription.currency)}',
                            style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.8)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Start Date: ${DateFormat('yyyy-MM-dd').format(subscription.startDate)}',
                            style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.8)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'End Date: ${DateFormat('yyyy-MM-dd').format(subscription.endDate)}',
                            style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.8)),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: _getStatusColor(subscription.status).withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  subscription.status,
                                  style: TextStyle(color: _getStatusColor(subscription.status), fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showEditSubscriptionDialog(subscription),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(subscription),
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
            error: (error, stack) => Center(
              child: Text(
                'Error: $error',
                style: const TextStyle(color: Colors.redAccent, fontSize: 16),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateSubscriptionDialog,
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.greenAccent;
      case 'Expired':
        return Colors.redAccent;
      case 'Pending':
        return Colors.orangeAccent;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(symbol: currency, decimalDigits: 2);
    return format.format(amount);
  }
}

class _SubscriptionSearchDelegate extends SearchDelegate<String> {
  final List<Subscription> subscriptions;

  _SubscriptionSearchDelegate(this.subscriptions);

  @override
  ThemeData appBarTheme(BuildContext context) {
    return ThemeData(
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF0f172a),
        foregroundColor: Color(0xFFf1f5f9),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        hintStyle: TextStyle(color: Color(0xFFf1f5f9)),
        labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
      ),
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: Color(0xFF6366f1),
        selectionColor: Color(0xFF6366f1),
        selectionHandleColor: Color(0xFF6366f1),
      ),
      textTheme: const TextTheme(
        titleLarge: TextStyle(color: Color(0xFFf1f5f9)),
      ),
    );
  }

  @override
  List<Widget>? buildActions(BuildContext context) {
    return [
      IconButton(
        icon: const Icon(Icons.clear, color: Color(0xFFf1f5f9)),
        onPressed: () {
          query = '';
        },
      ),
    ];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back, color: Color(0xFFf1f5f9)),
      onPressed: () {
        close(context, '');
      },
    );
  }

  @override
  Widget buildResults(BuildContext context) {
    final List<Subscription> searchResults = subscriptions.where((sub) {
      return sub.planName.toLowerCase().contains(query.toLowerCase()) ||
             sub.customerName.toLowerCase().contains(query.toLowerCase()) ||
             sub.status.toLowerCase().contains(query.toLowerCase());
    }).toList();

    return Container(
      color: const Color(0xFF0f172a),
      child: ListView.builder(
        itemCount: searchResults.length,
        itemBuilder: (context, index) {
          final subscription = searchResults[index];
          return Card(
            color: const Color(0xFF1e293b),
            margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: ListTile(
              title: Text(subscription.planName, style: const TextStyle(color: Color(0xFFf1f5f9))),
              subtitle: Text(subscription.customerName, style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7))),
              trailing: Text(subscription.status, style: TextStyle(color: _getStatusColor(subscription.status))),
              onTap: () {
                close(context, subscription.planName); // Or any other relevant data
              },
            ),
          );
        },
      ),
    );
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    final List<Subscription> suggestionList = query.isEmpty
        ? []
        : subscriptions.where((sub) {
            return sub.planName.toLowerCase().contains(query.toLowerCase()) ||
                   sub.customerName.toLowerCase().contains(query.toLowerCase()) ||
                   sub.status.toLowerCase().contains(query.toLowerCase());
          }).toList();

    return Container(
      color: const Color(0xFF0f172a),
      child: ListView.builder(
        itemCount: suggestionList.length,
        itemBuilder: (context, index) {
          final subscription = suggestionList[index];
          return ListTile(
            title: Text(subscription.planName, style: const TextStyle(color: Color(0xFFf1f5f9))),
            subtitle: Text(subscription.customerName, style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7))),
            onTap: () {
              query = subscription.planName;
              showResults(context);
            },
          );
        },
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.greenAccent;
      case 'Expired':
        return Colors.redAccent;
      case 'Pending':
        return Colors.orangeAccent;
      default:
        return const Color(0xFFf1f5f9);
    }
  }
}
