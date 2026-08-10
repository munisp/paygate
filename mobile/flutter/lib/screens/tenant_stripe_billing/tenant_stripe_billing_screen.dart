
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy data model for Stripe Billing
class StripeBilling {
  final String id;
  final String customerName;
  final String description;
  final double amount;
  final String currency;
  final DateTime date;
  final String status;

  StripeBilling({
    required this.id,
    required this.customerName,
    required this.description,
    required this.amount,
    required this.currency,
    required this.date,
    required this.status,
  });

  factory StripeBilling.fromJson(Map<String, dynamic> json) {
    return StripeBilling(
      id: json["id"],
      customerName: json["customerName"],
      description: json["description"],
      amount: (json["amount"] as num).toDouble(),
      currency: json["currency"],
      date: DateTime.parse(json["date"]),
      status: json["status"],
    );
  }
}

// Riverpod provider for fetching Stripe Billing data
final tenantStripeBillingProvider = FutureProvider.autoDispose<List<StripeBilling>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/tenantStripeBilling.list');
  // return (response.data as List).map((json) => StripeBilling.fromJson(json)).toList();

  // Dummy data for demonstration
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  return [
    StripeBilling(id: '1', customerName: 'John Doe', description: 'Monthly Subscription', amount: 1500.00, currency: 'NGN', date: DateTime(2026, 4, 1), status: 'Paid'),
    StripeBilling(id: '2', customerName: 'Jane Smith', description: 'Annual Plan', amount: 120.00, currency: 'USD', date: DateTime(2026, 3, 15), status: 'Pending'),
    StripeBilling(id: '3', customerName: 'Peter Jones', description: 'One-time Payment', amount: 5000.00, currency: 'NGN', date: DateTime(2026, 2, 20), status: 'Failed'),
    StripeBilling(id: '4', customerName: 'Alice Brown', description: 'Quarterly Subscription', amount: 30.00, currency: 'USD', date: DateTime(2026, 1, 10), status: 'Paid'),
    StripeBilling(id: '5', customerName: 'Bob White', description: 'Setup Fee', amount: 2500.00, currency: 'NGN', date: DateTime(2025, 12, 5), status: 'Paid'),
  ];
});

// Riverpod provider for search query
final searchQueryProvider = StateProvider.autoDispose<String>((ref) => '');

// Riverpod provider for filtered billing list
final filteredTenantStripeBillingProvider = Provider.autoDispose<List<StripeBilling>>((ref) {
  final billingList = ref.watch(tenantStripeBillingProvider).valueOrNull ?? [];
  final searchQuery = ref.watch(searchQueryProvider);

  if (searchQuery.isEmpty) {
    return billingList;
  } else {
    return billingList.where((billing) {
      return billing.customerName.toLowerCase().contains(searchQuery.toLowerCase()) ||
             billing.description.toLowerCase().contains(searchQuery.toLowerCase()) ||
             billing.status.toLowerCase().contains(searchQuery.toLowerCase());
    }).toList();
  }
});


class TenantStripeBillingScreen extends ConsumerStatefulWidget {
  const TenantStripeBillingScreen({super.key});

  @override
  ConsumerState<TenantStripeBillingScreen> createState() => _TenantStripeBillingScreenState();
}

class _TenantStripeBillingScreenState extends ConsumerState<TenantStripeBillingScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Tenant Stripe Billing', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by customer, description, or status',
                hintStyle: const TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: _cardColor,
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(tenantStripeBillingProvider.future),
              child: ref.watch(filteredTenantStripeBillingProvider).when(
                data: (billingList) {
                  if (billingList.isEmpty) {
                    return Center(
                      child: Text(
                        'No billing records found.',
                        style: TextStyle(color: _textColor),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: billingList.length,
                    itemBuilder: (context, index) {
                      final billing = billingList[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(billing.customerName, style: const TextStyle(color: _textColor)),
                          subtitle: Text(
                            '${billing.description} - ${billing.date.toLocal().toString().split(' ')[0]}',
                            style: TextStyle(color: _textColor.withOpacity(0.7)),
                          ),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '${billing.currency == 'NGN' ? '₦' : '$'}${billing.amount.toStringAsFixed(2)}',
                                style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _getStatusColor(billing.status),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  billing.status,
                                  style: const TextStyle(color: Colors.white, fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                          onTap: () {
                            // TODO: Implement view/edit billing details
                            _showBillingDetails(context, billing);
                          },
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (err, stack) => Center(
                  child: Text(
                    'Error: ${err.toString()}',
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Implement create new billing record
          _showCreateBillingDialog(context);
        },
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Paid':
        return Colors.green;
      case 'Pending':
        return Colors.orange;
      case 'Failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _showBillingDetails(BuildContext context, StripeBilling billing) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Billing Details', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('Customer: ${billing.customerName}', style: const TextStyle(color: _textColor)),
                Text('Description: ${billing.description}', style: const TextStyle(color: _textColor)),
                Text('Amount: ${billing.currency == 'NGN' ? '₦' : '$'}${billing.amount.toStringAsFixed(2)}', style: const TextStyle(color: _textColor)),
                Text('Date: ${billing.date.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: _textColor)),
                Text('Status: ${billing.status}', style: const TextStyle(color: _textColor)),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Edit', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
                _showEditBillingDialog(context, billing);
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                Navigator.of(context).pop();
                _confirmDeleteBilling(context, billing);
              },
            ),
            TextButton(
              child: const Text('Close', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showCreateBillingDialog(BuildContext context) {
    final TextEditingController customerController = TextEditingController();
    final TextEditingController descriptionController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'NGN');
    final TextEditingController statusController = TextEditingController(text: 'Pending');

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Create New Billing', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerController,
                  decoration: InputDecoration(labelText: 'Customer Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: descriptionController,
                  decoration: InputDecoration(labelText: 'Description', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: currencyController,
                  decoration: InputDecoration(labelText: 'Currency (e.g., NGN, USD)', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: statusController,
                  decoration: InputDecoration(labelText: 'Status (e.g., Paid, Pending, Failed)', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // TODO: Implement actual create API call
                print('Create: ${customerController.text}, ${descriptionController.text}, ${amountController.text}, ${currencyController.text}, ${statusController.text}');
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditBillingDialog(BuildContext context, StripeBilling billing) {
    final TextEditingController customerController = TextEditingController(text: billing.customerName);
    final TextEditingController descriptionController = TextEditingController(text: billing.description);
    final TextEditingController amountController = TextEditingController(text: billing.amount.toString());
    final TextEditingController currencyController = TextEditingController(text: billing.currency);
    final TextEditingController statusController = TextEditingController(text: billing.status);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Billing', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerController,
                  decoration: InputDecoration(labelText: 'Customer Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: descriptionController,
                  decoration: InputDecoration(labelText: 'Description', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: currencyController,
                  decoration: InputDecoration(labelText: 'Currency (e.g., NGN, USD)', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: statusController,
                  decoration: InputDecoration(labelText: 'Status (e.g., Paid, Pending, Failed)', labelStyle: TextStyle(color: _textColor.withOpacity(0.7))), 
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () {
                // TODO: Implement actual update API call
                print('Update: ${billing.id}, ${customerController.text}, ${descriptionController.text}, ${amountController.text}, ${currencyController.text}, ${statusController.text}');
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _confirmDeleteBilling(BuildContext context, StripeBilling billing) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Confirm Delete', style: const TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete billing record for ${billing.customerName}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                // TODO: Implement actual delete API call
                print('Delete billing with ID: ${billing.id}');
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
