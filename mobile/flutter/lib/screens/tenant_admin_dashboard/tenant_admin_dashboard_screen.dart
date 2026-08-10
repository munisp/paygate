import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Placeholder for dashboard data model
class DashboardData {
  final String message;
  final int activeTenants;
  final double totalRevenue;
  final List<TransactionSummary> recentTransactions;

  DashboardData({
    required this.message,
    required this.activeTenants,
    required this.totalRevenue,
    required this.recentTransactions,
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    return DashboardData(
      message: json['message'] as String,
      activeTenants: json['activeTenants'] as int,
      totalRevenue: (json['totalRevenue'] as num).toDouble(),
      recentTransactions: (json['recentTransactions'] as List)
          .map((e) => TransactionSummary.fromJson(e))
          .toList(),
    );
  }
}

class TransactionSummary {
  final String id;
  final String description;
  final double amount;
  final String currency;
  final DateTime date;
  final String status;

  TransactionSummary({
    required this.id,
    required this.description,
    required this.amount,
    required this.currency,
    required this.date,
    required this.status,
  });

  factory TransactionSummary.fromJson(Map<String, dynamic> json) {
    return TransactionSummary(
      id: json['id'] as String,
      description: json['description'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      date: DateTime.parse(json['date'] as String),
      status: json['status'] as String,
    );
  }
}

// FutureProvider to fetch dashboard data
final tenantAdminDashboardDataProvider = FutureProvider<DashboardData>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // In a real app, you would call the tRPC API here:
    // final response = await api.get('/trpc/tenantAdmin.getDashboardData');
    // return DashboardData.fromJson(response);

    // Simulate API response for now
    await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
    return DashboardData.fromJson({
      'message': 'Welcome, Admin!',
      'activeTenants': 42,
      'totalRevenue': 1234567.89,
      'recentTransactions': [
        {
          'id': 'txn_001',
          'description': 'Online Payment',
          'amount': 2500.00,
          'currency': 'NGN',
          'date': '2026-05-15T10:30:00Z',
          'status': 'completed',
        },
        {
          'id': 'txn_002',
          'description': 'Subscription Fee',
          'amount': 50.00,
          'currency': 'USD',
          'date': '2026-05-14T14:00:00Z',
          'status': 'pending',
        },
        {
          'id': 'txn_003',
          'description': 'Refund',
          'amount': 100.00,
          'currency': 'NGN',
          'date': '2026-05-13T09:15:00Z',
          'status': 'failed',
        },
        {
          'id': 'txn_004',
          'description': 'Service Charge',
          'amount': 15.00,
          'currency': 'USD',
          'date': '2026-05-12T11:00:00Z',
          'status': 'completed',
        },
        {
          'id': 'txn_005',
          'description': 'Withdrawal',
          'amount': 5000.00,
          'currency': 'NGN',
          'date': '2026-05-11T16:00:00Z',
          'status': 'completed',
        },
      ],
    });
  } catch (e) {
    throw Exception('Failed to load dashboard data: $e');
  }
});

class TenantAdminDashboardScreen extends ConsumerStatefulWidget {
  const TenantAdminDashboardScreen({super.key});

  @override
  ConsumerState<TenantAdminDashboardScreen> createState() => _TenantAdminDashboardScreenState();
}

class _TenantAdminDashboardScreenState extends ConsumerState<TenantAdminDashboardScreen> {
  // Define theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Helper for currency formatting
  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  // Helper for date formatting
  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy HH:mm').format(date);
  }

  // Helper for status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // CRUD Dialogs (placeholders)
  void _showCreateDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create New Item', style: TextStyle(color: _textColor)),
          content: TextField(
            style: const TextStyle(color: _textColor),
            decoration: InputDecoration(
              hintText: 'Enter item name',
              hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
              enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // TODO: Implement actual create logic via API
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Item created successfully!')), 
                );
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(TransactionSummary transaction) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Transaction ${transaction.id}', style: const TextStyle(color: _textColor)),
          content: TextField(
            style: const TextStyle(color: _textColor),
            controller: TextEditingController(text: transaction.description),
            decoration: InputDecoration(
              hintText: 'Edit description',
              hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
              enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // TODO: Implement actual update logic via API
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Transaction ${transaction.id} updated!')), 
                );
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(TransactionSummary transaction) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete transaction ${transaction.id}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                // TODO: Implement actual delete logic via API
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Transaction ${transaction.id} deleted!')), 
                );
                ref.invalidate(tenantAdminDashboardDataProvider); // Refresh data after delete
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final dashboardDataAsync = ref.watch(tenantAdminDashboardDataProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  hintText: 'Search transactions...', 
                  hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  border: InputBorder.none,
                ),
                onChanged: (query) {
                  setState(() { /* Trigger rebuild to filter list */ });
                },
              )
            : const Text('Tenant Admin Dashboard', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search, color: _textColor),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchController.clear();
                  // Optionally, trigger a rebuild to show unfiltered list immediately
                  // setState(() {}); 
                }
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: _showCreateDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(tenantAdminDashboardDataProvider);
          await ref.read(tenantAdminDashboardDataProvider.future); // Wait for refresh to complete
        },
        child: dashboardDataAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
            ),
          ),
          data: (data) {
            final filteredTransactions = _searchController.text.isEmpty
                ? data.recentTransactions
                : data.recentTransactions.where((transaction) {
                    final query = _searchController.text.toLowerCase();
                    return transaction.description.toLowerCase().contains(query) ||
                           transaction.id.toLowerCase().contains(query) ||
                           transaction.status.toLowerCase().contains(query);
                  }).toList();

            return ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Welcome Card
                Card(
                  color: _cardColor,
                  margin: const EdgeInsets.only(bottom: 16.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.message,
                          style: const TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8.0),
                        Text(
                          'Active Tenants: ${data.activeTenants}',
                          style: const TextStyle(color: _textColor, fontSize: 16),
                        ),
                        const SizedBox(height: 8.0),
                        Text(
                          'Total Revenue: ${_formatCurrency(data.totalRevenue, 'NGN')}', // Assuming NGN for total revenue
                          style: const TextStyle(color: _textColor, fontSize: 16),
                        ),
                      ],
                    ),
                  ),
                ),

                // Recent Transactions Section
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Text(
                    'Recent Transactions',
                    style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                if (filteredTransactions.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Text(
                        _searchController.text.isEmpty ? 'No recent transactions to display.' : 'No matching transactions found.',
                        style: TextStyle(color: _textColor.withOpacity(0.7)),
                      ),
                    ),
                  )
                else
                  ...filteredTransactions.map((transaction) => Card(
                        color: _cardColor,
                        margin: const EdgeInsets.only(bottom: 8.0),
                        child: ListTile(
                          title: Text(transaction.description, style: const TextStyle(color: _textColor)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _formatCurrency(transaction.amount, transaction.currency),
                                style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                              ),
                              Text(
                                _formatDate(transaction.date),
                                style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 12),
                              ),
                            ],
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                            decoration: BoxDecoration(
                              color: _getStatusColor(transaction.status),
                              borderRadius: BorderRadius.circular(4.0),
                            ),
                            child: Text(
                              transaction.status.toUpperCase(),
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                          onTap: () => _showEditDialog(transaction),
                          onLongPress: () => _showDeleteConfirmationDialog(transaction),
                        ),
                      )),

                // Placeholder for other sections like Tenant List with CRUD
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Text(
                    'Tenant Management',
                    style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                Card(
                  color: _cardColor,
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'List of tenants with search, filter, edit, delete actions.',
                          style: TextStyle(color: _textColor.withOpacity(0.7)),
                        ),
                        const SizedBox(height: 16.0),
                        ElevatedButton.icon(
                          onPressed: () {
                            // TODO: Navigate to a dedicated Tenant Management screen for full CRUD
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Navigating to Tenant Management screen')), 
                            );
                          },
                          icon: const Icon(Icons.people, color: _textColor),
                          label: const Text('Manage Tenants', style: TextStyle(color: _textColor)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _accentColor, // Button background color
                            foregroundColor: _textColor, // Button text color
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
