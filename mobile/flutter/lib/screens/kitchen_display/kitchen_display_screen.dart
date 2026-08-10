
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date formatting
import '../../services/api_service.dart';

// Data Model
class KitchenItem {
  final String id;
  final String orderId;
  final String itemName;
  final int quantity;
  final String status;
  final double amount; // Added for amount formatting
  final String currency; // Added for currency
  final DateTime orderTime;

  KitchenItem({
    required this.id,
    required this.orderId,
    required this.itemName,
    required this.quantity,
    required this.status,
    required this.amount,
    required this.currency,
    required this.orderTime,
  });

  factory KitchenItem.fromJson(Map<String, dynamic> json) {
    return KitchenItem(
      id: json['id'],
      orderId: json['orderId'],
      itemName: json['itemName'],
      quantity: json['quantity'],
      status: json['status'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      orderTime: DateTime.parse(json['orderTime']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'orderId': orderId,
        'itemName': itemName,
        'quantity': quantity,
        'status': status,
        'amount': amount,
        'currency': currency,
        'orderTime': orderTime.toIso8601String(),
      };

  KitchenItem copyWith({
    String? id,
    String? orderId,
    String? itemName,
    int? quantity,
    String? status,
    double? amount,
    String? currency,
    DateTime? orderTime,
  }) {
    return KitchenItem(
      id: id ?? this.id,
      orderId: orderId ?? this.orderId,
      itemName: itemName ?? this.itemName,
      quantity: quantity ?? this.quantity,
      status: status ?? this.status,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      orderTime: orderTime ?? this.orderTime,
    );
  }
}

// State Notifier for Kitchen Display Data
class KitchenDisplayNotifier extends StateNotifier<AsyncValue<List<KitchenItem>>> {
  final ApiService apiService;
  String _searchQuery = '';
  String _filterStatus = 'All';

  KitchenDisplayNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchKitchenItems();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    fetchKitchenItems();
  }

  void setFilterStatus(String status) {
    _filterStatus = status;
    fetchKitchenItems();
  }

  Future<void> fetchKitchenItems() async {
    state = const AsyncValue.loading();
    try {
      // Simulate tRPC call for fetching kitchen items
      final response = await apiService.get(
        '/trpc/kitchenDisplay.list',
        params: {'search': _searchQuery, 'filter': _filterStatus},
      );

      // Simulate data based on search and filter
      List<dynamic> rawData = [
        {'id': '1', 'orderId': 'PG1001', 'itemName': 'Pizza Margherita', 'quantity': 2, 'status': 'Pending', 'amount': 12.50, 'currency': 'USD', 'orderTime': '2026-05-16T10:00:00Z'},
        {'id': '2', 'orderId': 'PG1002', 'itemName': 'Pasta Carbonara', 'quantity': 1, 'status': 'Preparing', 'amount': 15.00, 'currency': 'USD', 'orderTime': '2026-05-16T10:15:00Z'},
        {'id': '3', 'orderId': 'PG1003', 'itemName': 'Caesar Salad', 'quantity': 3, 'status': 'Ready', 'amount': 8.75, 'currency': 'USD', 'orderTime': '2026-05-16T10:30:00Z'},
        {'id': '4', 'orderId': 'PG1004', 'itemName': 'Burger Combo', 'quantity': 1, 'status': 'Pending', 'amount': 20.00, 'currency': 'NGN', 'orderTime': '2026-05-16T11:00:00Z'},
        {'id': '5', 'orderId': 'PG1005', 'itemName': 'Chicken Wings', 'quantity': 2, 'status': 'Preparing', 'amount': 10.00, 'currency': 'USD', 'orderTime': '2026-05-16T11:10:00Z'},
      ];

      List<KitchenItem> filteredData = rawData.map((item) => KitchenItem.fromJson(item)).where((item) {
        final matchesSearch = _searchQuery.isEmpty ||
            item.itemName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
            item.orderId.toLowerCase().contains(_searchQuery.toLowerCase());
        final matchesFilter = _filterStatus == 'All' || item.status == _filterStatus;
        return matchesSearch && matchesFilter;
      }).toList();

      state = AsyncValue.data(filteredData);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> addKitchenItem(KitchenItem newItem) async {
    try {
      // Simulate tRPC call for adding a kitchen item
      await apiService.post('/trpc/kitchenDisplay.create', body: newItem.toJson());
      // After successful creation, refetch the list to update UI
      fetchKitchenItems();
    } catch (e, st) {
      // Handle error
      debugPrint('Error adding item: $e');
    }
  }

  Future<void> updateKitchenItem(KitchenItem updatedItem) async {
    try {
      // Simulate tRPC call for updating a kitchen item
      await apiService.post('/trpc/kitchenDisplay.update', body: updatedItem.toJson());
      // After successful update, refetch the list to update UI
      fetchKitchenItems();
    } catch (e, st) {
      // Handle error
      debugPrint('Error updating item: $e');
    }
  }

  Future<void> deleteKitchenItem(String itemId) async {
    try {
      // Simulate tRPC call for deleting a kitchen item
      await apiService.post('/trpc/kitchenDisplay.delete', body: {'id': itemId});
      // After successful deletion, refetch the list to update UI
      fetchKitchenItems();
    } catch (e, st) {
      // Handle error
      debugPrint('Error deleting item: $e');
    }
  }
}

final kitchenDisplayProvider = StateNotifierProvider<KitchenDisplayNotifier, AsyncValue<List<KitchenItem>>>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return KitchenDisplayNotifier(apiService);
});

class KitchenDisplayScreen extends ConsumerStatefulWidget {
  const KitchenDisplayScreen({super.key});

  @override
  ConsumerState<KitchenDisplayScreen> createState() => _KitchenDisplayScreenState();
}

class _KitchenDisplayScreenState extends ConsumerState<KitchenDisplayScreen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();
  String _selectedFilterStatus = 'All';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(kitchenDisplayProvider.notifier).setSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending':
        return Colors.orange;
      case 'Preparing':
        return Colors.blue;
      case 'Ready':
        return Colors.green;
      case 'Delivered':
        return Colors.grey;
      default:
        return _textColor;
    }
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM d, yyyy HH:mm').format(date);
  }

  @override
  Widget build(BuildContext context) {
    final kitchenItemsAsyncValue = ref.watch(kitchenDisplayProvider);
    final notifier = ref.read(kitchenDisplayProvider.notifier);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Kitchen Display', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight * 2),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by item or order ID...', 
                    hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                    filled: true,
                    fillColor: _backgroundColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide(color: _textColor.withOpacity(0.5)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: const BorderSide(color: _accentColor),
                    ),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                child: DropdownButtonFormField<String>(
                  value: _selectedFilterStatus,
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Filter by Status', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['All', 'Pending', 'Preparing', 'Ready', 'Delivered']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      setState(() {
                        _selectedFilterStatus = newValue;
                      });
                      notifier.setFilterStatus(newValue);
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.fetchKitchenItems(),
        child: kitchenItemsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (items) {
            if (items.isEmpty) {
              return Center(
                child: Text(
                  'No kitchen items to display.',
                  style: TextStyle(color: _textColor, fontSize: 18),
                ),
              );
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Order ID: ${item.orderId}', style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text('Item: ${item.itemName} x ${item.quantity}', style: const TextStyle(color: _textColor)),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: _textColor)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: _getStatusColor(item.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(item.status, style: const TextStyle(color: Colors.white, fontSize: 12)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('Amount: ${_formatAmount(item.amount, item.currency)}', style: const TextStyle(color: _textColor)),
                        const SizedBox(height: 4),
                        Text('Order Time: ${_formatDate(item.orderTime)}', style: const TextStyle(color: _textColor.withOpacity(0.7))),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showEditItemDialog(context, item, notifier),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteConfirmationDialog(context, item, notifier),
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
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateItemDialog(context, notifier),
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }

  void _showCreateItemDialog(BuildContext context, KitchenDisplayNotifier notifier) {
    final TextEditingController orderIdController = TextEditingController();
    final TextEditingController itemNameController = TextEditingController();
    final TextEditingController quantityController = TextEditingController();
    final TextEditingController amountController = TextEditingController();
    String selectedStatus = 'Pending';
    String selectedCurrency = 'USD';

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Add New Kitchen Item', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize. quizás, 
              children: [
                TextField(
                  controller: orderIdController,
                  decoration: InputDecoration(
                    labelText: 'Order ID', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: itemNameController,
                  decoration: InputDecoration(
                    labelText: 'Item Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: quantityController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Quantity', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number, // Allow decimal input
                  decoration: InputDecoration(
                    labelText: 'Amount', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['USD', 'NGN']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedCurrency = newValue;
                    }
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['Pending', 'Preparing', 'Ready', 'Delivered']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedStatus = newValue;
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            TextButton(
              onPressed: () {
                final newItem = KitchenItem(
                  id: DateTime.now().millisecondsSinceEpoch.toString(), // Unique ID
                  orderId: orderIdController.text,
                  itemName: itemNameController.text,
                  quantity: int.tryParse(quantityController.text) ?? 1,
                  status: selectedStatus,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: selectedCurrency,
                  orderTime: DateTime.now(),
                );
                notifier.addKitchenItem(newItem);
                Navigator.of(context).pop();
              },
              child: const Text('Add', style: TextStyle(color: _accentColor)),
            ),
          ],
        );
      },
    );
  }

  void _showEditItemDialog(BuildContext context, KitchenItem item, KitchenDisplayNotifier notifier) {
    final TextEditingController orderIdController = TextEditingController(text: item.orderId);
    final TextEditingController itemNameController = TextEditingController(text: item.itemName);
    final TextEditingController quantityController = TextEditingController(text: item.quantity.toString());
    final TextEditingController amountController = TextEditingController(text: item.amount.toString());
    String selectedStatus = item.status;
    String selectedCurrency = item.currency;

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit Kitchen Item', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: orderIdController,
                  decoration: InputDecoration(
                    labelText: 'Order ID', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: itemNameController,
                  decoration: InputDecoration(
                    labelText: 'Item Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: quantityController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Quantity', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Currency', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['USD', 'NGN']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedCurrency = newValue;
                    }
                  },
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['Pending', 'Preparing', 'Ready', 'Delivered']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      selectedStatus = newValue;
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            TextButton(
              onPressed: () {
                final updatedItem = item.copyWith(
                  orderId: orderIdController.text,
                  itemName: itemNameController.text,
                  quantity: int.tryParse(quantityController.text) ?? 1,
                  status: selectedStatus,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  currency: selectedCurrency,
                );
                notifier.updateKitchenItem(updatedItem);
                Navigator.of(context).pop();
              },
              child: const Text('Save', style: TextStyle(color: _accentColor)),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, KitchenItem item, KitchenDisplayNotifier notifier) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Delete Item', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete ${item.itemName} (Order ID: ${item.orderId})?', style: const TextStyle(color: _textColor)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            TextButton(
              onPressed: () {
                notifier.deleteKitchenItem(item.id);
                Navigator.of(context).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}
