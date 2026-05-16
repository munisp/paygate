import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the data model for GoldSIP items
class GoldSIPItem {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final String status;
  final DateTime startDate;

  GoldSIPItem({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.status,
    required this.startDate,
  });

  factory GoldSIPItem.fromJson(Map<String, dynamic> json) {
    return GoldSIPItem(
      id: json['id'],
      name: json['name'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      startDate: DateTime.parse(json['startDate']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'amount': amount,
        'currency': currency,
        'status': status,
        'startDate': startDate.toIso8601String(),
      };
}

// Define the Riverpod provider for GoldSIP data
final goldSIPProvider = FutureProvider.autoDispose<List<GoldSIPItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/goldSIP.list');
    // Assuming the response is a list of maps
    return (response as List).map((item) => GoldSIPItem.fromJson(item)).toList();
  } catch (e) {
    throw Exception('Failed to load GoldSIP data: $e');
  }
});

class GoldSIPScreen extends ConsumerStatefulWidget {
  const GoldSIPScreen({super.key});

  @override
  ConsumerState<GoldSIPScreen> createState() => _GoldSIPScreenState();
}

class _GoldSIPScreenState extends ConsumerState<GoldSIPScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
    ref.invalidate(goldSIPProvider);
    await ref.read(goldSIPProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final goldSIPAsyncValue = ref.watch(goldSIPProvider);

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('GoldSIP', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: accentColor,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  hintText: 'Search GoldSIPs...',
                  hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: textColor),
                  filled: true,
                  fillColor: cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: goldSIPAsyncValue.when(
                data: (items) {
                  final filteredItems = items.where((item) {
                    return item.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                           item.status.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (filteredItems.isEmpty) {
                    return Center(
                      child: Text(
                        'No GoldSIPs found.',
                        style: TextStyle(color: textColor, fontSize: 18),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredItems.length,
                    itemBuilder: (context, index) {
                      final item = filteredItems[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(item.name, style: const TextStyle(color: textColor)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Amount: ${formatCurrency(item.amount, item.currency)}', style: TextStyle(color: textColor.withOpacity(0.8))),
                              Text('Status: ${item.status}', style: TextStyle(color: getStatusColor(item.status))), // Placeholder for status badge
                              Text('Start Date: ${formatDate(item.startDate)}', style: TextStyle(color: textColor.withOpacity(0.8))),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: accentColor),
                                onPressed: () => _showEditDialog(context, item), // Placeholder for edit
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(context, item), // Placeholder for delete
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (error, stack) => Center(
                  child: Text('Error: ${error.toString()}', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context), // Placeholder for create
        backgroundColor: accentColor,
        child: const Icon(Icons.add, color: textColor),
      ),
    );
  }

  // Helper functions for formatting and UI
  String formatCurrency(double amount, String currency) {
    if (currency == 'NGN') {
      return '₦${amount.toStringAsFixed(2)}';
    } else if (currency == 'USD') {
      return '$${amount.toStringAsFixed(2)}';
    }
    return '${amount.toStringAsFixed(2)} $currency';
  }

  String formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  Color getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // CRUD Dialogs
  void _showCreateDialog(BuildContext context) {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'NGN');
    final TextEditingController statusController = TextEditingController(text: 'pending');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: cardColor,
        title: const Text('Create GoldSIP', style: TextStyle(color: textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: amountController,
                style: const TextStyle(color: textColor),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Currency (e.g., NGN, USD)',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Status (e.g., active, pending)',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: accentColor)),
          ),
          TextButton(
            onPressed: () async {
              try {
                final newGoldSIP = GoldSIPItem(
                  id: UniqueKey().toString(), // Generate a unique ID for new item
                  name: nameController.text,
                  amount: double.parse(amountController.text),
                  currency: currencyController.text,
                  status: statusController.text,
                  startDate: DateTime.now(),
                );
                await ref.read(apiServiceProvider).post('/trpc/goldSIP.create', body: newGoldSIP.toJson());
                _refreshData();
                Navigator.of(context).pop();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to create GoldSIP: $e', style: const TextStyle(color: textColor)), backgroundColor: Colors.redAccent),
                );
              }
            },
            child: const Text('Create', style: TextStyle(color: accentColor)),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(BuildContext context, GoldSIPItem item) {
    final TextEditingController nameController = TextEditingController(text: item.name);
    final TextEditingController amountController = TextEditingController(text: item.amount.toString());
    final TextEditingController currencyController = TextEditingController(text: item.currency);
    final TextEditingController statusController = TextEditingController(text: item.status);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: cardColor,
        title: Text('Edit ${item.name}', style: const TextStyle(color: textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: amountController,
                style: const TextStyle(color: textColor),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Currency (e.g., NGN, USD)',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  labelText: 'Status (e.g., active, pending)',
                  labelStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: accentColor)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: accentColor)),
          ),
          TextButton(
            onPressed: () async {
              try {
                final updatedGoldSIP = GoldSIPItem(
                  id: item.id,
                  name: nameController.text,
                  amount: double.parse(amountController.text),
                  currency: currencyController.text,
                  status: statusController.text,
                  startDate: item.startDate,
                );
                await ref.read(apiServiceProvider).post('/trpc/goldSIP.update', body: updatedGoldSIP.toJson());
                _refreshData();
                Navigator.of(context).pop();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to update GoldSIP: $e', style: const TextStyle(color: textColor)), backgroundColor: Colors.redAccent),
                );
              }
            },
            child: const Text('Save', style: TextStyle(color: accentColor)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, GoldSIPItem item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: cardColor,
        title: const Text('Confirm Delete', style: TextStyle(color: textColor)),
        content: Text('Are you sure you want to delete ${item.name}?', style: const TextStyle(color: textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: accentColor)),
          ),
          TextButton(
            onPressed: () async {
              try {
                await ref.read(apiServiceProvider).post('/trpc/goldSIP.delete', body: {'id': item.id});
                _refreshData();
                Navigator.of(context).pop();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Failed to delete GoldSIP: $e', style: const TextStyle(color: textColor)), backgroundColor: Colors.redAccent),
                );
              }
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
  }
}
