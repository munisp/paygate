import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the data model for EMI items
class EMIItem {
  final String id;
  final String customerName;
  final double amount;
  final String currency;
  final DateTime startDate;
  final DateTime endDate;
  final String status;

  EMIItem({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory EMIItem.fromJson(Map<String, dynamic> json) {
    return EMIItem(
      id: json['id'] as String,
      customerName: json['customerName'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      status: json['status'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'amount': amount,
        'currency': currency,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'status': status,
      };

  EMIItem copyWith({
    String? id,
    String? customerName,
    double? amount,
    String? currency,
    DateTime? startDate,
    DateTime? endDate,
    String? status,
  }) {
    return EMIItem(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      status: status ?? this.status,
    );
  }
}

// Riverpod provider for search query
final emiSearchQueryProvider = StateProvider<String>((ref) => '');

// Riverpod provider for fetching EMI items with search/filter
final emiListProvider = FutureProvider.autoDispose<List<EMIItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(emiSearchQueryProvider);
  try {
    // Simulate API call with a delay
    await Future.delayed(const Duration(milliseconds: 300));

    // Example tRPC call for listing EMI items
    // In a real scenario, you would pass the searchQuery as a parameter to the API
    // final response = await api.get('/trpc/emi.list', params: {'query': searchQuery});
    // return (response.data as List).map((e) => EMIItem.fromJson(e)).toList();

    // Mock data for demonstration
    final List<EMIItem> mockData = [
      EMIItem(id: '1', customerName: 'Alice Smith', amount: 1200.50, currency: '₦', startDate: DateTime(2023, 1, 1), endDate: DateTime(2024, 1, 1), status: 'Active'),
      EMIItem(id: '2', customerName: 'Bob Johnson', amount: 500.00, currency: '$', startDate: DateTime(2023, 3, 15), endDate: DateTime(2023, 9, 15), status: 'Completed'),
      EMIItem(id: '3', customerName: 'Charlie Brown', amount: 2500.75, currency: '₦', startDate: DateTime(2024, 2, 1), endDate: DateTime(2025, 2, 1), status: 'Pending'),
      EMIItem(id: '4', customerName: 'Diana Prince', amount: 800.00, currency: '$', startDate: DateTime(2023, 6, 1), endDate: DateTime(2024, 6, 1), status: 'Active'),
    ];

    if (searchQuery.isEmpty) {
      return mockData;
    } else {
      return mockData.where((item) => item.customerName.toLowerCase().contains(searchQuery.toLowerCase())).toList();
    }
  } catch (e) {
    throw Exception('Failed to load EMI items: $e');
  }
});

class EMIManagementScreen extends ConsumerStatefulWidget {
  const EMIManagementScreen({super.key});

  @override
  ConsumerState<EMIManagementScreen> createState() => _EMIManagementScreenState();
}

class _EMIManagementScreenState extends ConsumerState<EMIManagementScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _showCreateEditDialog({EMIItem? item}) async {
    final isEditing = item != null;
    final TextEditingController customerNameController = TextEditingController(text: item?.customerName);
    final TextEditingController amountController = TextEditingController(text: item?.amount.toString());
    final TextEditingController currencyController = TextEditingController(text: item?.currency);
    DateTime? startDate = item?.startDate;
    DateTime? endDate = item?.endDate;
    String? status = item?.status;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit EMI Item' : 'Create EMI Item', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                TextField(
                  controller: customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: currencyController,
                  decoration: const InputDecoration(
                    labelText: 'Currency (₦ or $)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                // Date Pickers
                ListTile(
                  title: Text('Start Date: ${startDate != null ? startDate.toLocal().toString().split(' ')[0] : 'Select Date'}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFFf1f5f9)),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: dialogContext,
                      initialDate: startDate ?? DateTime.now(),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                      builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // Accent color
                              onPrimary: Color(0xFFf1f5f9), // Light text
                              surface: Color(0xFF1e293b), // Card background
                              onSurface: Color(0xFFf1f5f9), // Light text
                            ),
                            dialogBackgroundColor: const Color(0xFF1e293b),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null) {
                      setState(() {
                        startDate = picked;
                      });
                    }
                  },
                ),
                ListTile(
                  title: Text('End Date: ${endDate != null ? endDate.toLocal().toString().split(' ')[0] : 'Select Date'}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFFf1f5f9)),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: dialogContext,
                      initialDate: endDate ?? DateTime.now(),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                      builder: (context, child) {
                        return Theme(
                          data: ThemeData.dark().copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFF6366f1), // Accent color
                              onPrimary: Color(0xFFf1f5f9), // Light text
                              surface: Color(0xFF1e293b), // Card background
                              onSurface: Color(0xFFf1f5f9), // Light text
                            ),
                            dialogBackgroundColor: const Color(0xFF1e293b),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (picked != null) {
                      setState(() {
                        endDate = picked;
                      });
                    }
                  },
                ),
                // Status Dropdown
                DropdownButtonFormField<String>(
                  value: status,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String>['Active', 'Completed', 'Pending', 'Cancelled'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    setState(() {
                      status = newValue;
                    });
                  },
                ),
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
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final newCustomerName = customerNameController.text;
                final newAmount = double.tryParse(amountController.text) ?? 0.0;
                final newCurrency = currencyController.text;
                final newStatus = status ?? 'Pending';

                if (newCustomerName.isEmpty || newAmount <= 0 || newCurrency.isEmpty || startDate == null || endDate == null) {
                  // Show error or validation message
                  return;
                }

                final newItem = EMIItem(
                  id: item?.id ?? DateTime.now().millisecondsSinceEpoch.toString(), // Generate unique ID for new item
                  customerName: newCustomerName,
                  amount: newAmount,
                  currency: newCurrency,
                  startDate: startDate!,
                  endDate: endDate!,
                  status: newStatus,
                );

                try {
                  final api = ref.read(apiServiceProvider);
                  if (isEditing) {
                    // Example tRPC call for updating an EMI item
                    // await api.post('/trpc/emi.update', body: newItem.toJson());
                    print('Updating item: ${newItem.toJson()}');
                  } else {
                    // Example tRPC call for creating an EMI item
                    // await api.post('/trpc/emi.create', body: newItem.toJson());
                    print('Creating item: ${newItem.toJson()}');
                  }
                  ref.invalidate(emiListProvider); // Refresh the list
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error, show a snackbar or alert
                  print('Error saving EMI item: $e');
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _confirmDelete(String itemId) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this EMI item?', style: TextStyle(color: Color(0xFFf1f5f9))),
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
                try {
                  final api = ref.read(apiServiceProvider);
                  // Example tRPC call for deleting an EMI item
                  // await api.post('/trpc/emi.delete', body: {'id': itemId});
                  print('Deleting item with ID: $itemId');
                  ref.invalidate(emiListProvider); // Refresh the list
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  print('Error deleting EMI item: $e');
                }
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final emiListAsyncValue = ref.watch(emiListProvider);
    final searchQuery = ref.watch(emiSearchQueryProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('EMI Management', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card-like background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              onChanged: (query) {
                ref.read(emiSearchQueryProvider.notifier).state = query;
              },
              decoration: InputDecoration(
                hintText: 'Search by customer name...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Darker background for search bar
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(emiListProvider.future),
        child: emiListAsyncValue.when(
          data: (items) {
            if (items.isEmpty) {
              return const Center(
                child: Text(
                  'No EMI items found.',
                  style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                ),
              );
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Customer: ${item.customerName}', style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text('Amount: ${item.currency} ${item.amount.toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Amount formatting
                        Text('Start Date: ${item.startDate.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Date formatting
                        Text('End Date: ${item.endDate.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Date formatting
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9))), // Status badge
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: _getStatusColor(item.status), // Dynamic status coloring
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(item.status, style: const TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showCreateEditDialog(item: item),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Delete color
                                onPressed: () => _confirmDelete(item.id),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
          error: (error, stack) => Center(
            child: Text(
              'Error: ${error.toString()}',
              style: const TextStyle(color: Colors.red, fontSize: 16),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)), // Light icon
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.green;
      case 'Completed':
        return Colors.blue;
      case 'Pending':
        return Colors.orange;
      case 'Cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
