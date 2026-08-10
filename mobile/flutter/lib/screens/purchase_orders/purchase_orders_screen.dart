import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Placeholder for PurchaseOrder model
class PurchaseOrder {
  final String id;
  final String customerName;
  final double amount;
  final String currency;
  final String status;
  final DateTime orderDate;

  PurchaseOrder({
    required this.id,
    required this.customerName,
    required this.amount,
    required this.currency,
    required this.status,
    required this.orderDate,
  });

  factory PurchaseOrder.fromJson(Map<String, dynamic> json) {
    return PurchaseOrder(
      id: json['id'],
      customerName: json['customerName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      orderDate: DateTime.parse(json['orderDate']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'amount': amount,
        'currency': currency,
        'status': status,
        'orderDate': orderDate.toIso8601String(),
      };
}

// Riverpod provider for search query and filter status
final searchQueryProvider = StateProvider<String>((ref) => '');
final filterStatusProvider = StateProvider<String?>((ref) => null);

// Riverpod provider for fetching purchase orders with search and filter
final purchaseOrdersProvider = FutureProvider.autoDispose<List<PurchaseOrder>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);
  final filterStatus = ref.watch(filterStatusProvider);

  try {
    final params = <String, dynamic>{
      'search': searchQuery,
      if (filterStatus != null && filterStatus != 'All') 'status': filterStatus,
    };
    final response = await api.get('/trpc/purchaseOrders.list', params: params);
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List).map((e) => PurchaseOrder.fromJson(e)).toList();
  } catch (e) {
    throw Exception('Failed to load purchase orders: $e');
  }
});

// Riverpod provider for creating a purchase order
final createPurchaseOrderProvider = FutureProvider.autoDispose.family<void, PurchaseOrder>((ref, newOrder) async {
  final api = ref.read(apiServiceProvider);
  try {
    await api.post('/trpc/purchaseOrders.create', body: newOrder.toJson());
    ref.invalidate(purchaseOrdersProvider); // Refresh the list after creation
  } catch (e) {
    throw Exception('Failed to create purchase order: $e');
  }
});

// Riverpod provider for updating a purchase order
final updatePurchaseOrderProvider = FutureProvider.autoDispose.family<void, PurchaseOrder>((ref, updatedOrder) async {
  final api = ref.read(apiServiceProvider);
  try {
    await api.post('/trpc/purchaseOrders.update', body: updatedOrder.toJson());
    ref.invalidate(purchaseOrdersProvider); // Refresh the list after update
  } catch (e) {
    throw Exception('Failed to update purchase order: $e');
  }
});

// Riverpod provider for deleting a purchase order
final deletePurchaseOrderProvider = FutureProvider.autoDispose.family<void, String>((ref, orderId) async {
  final api = ref.read(apiServiceProvider);
  try {
    await api.post('/trpc/purchaseOrders.delete', body: {'id': orderId});
    ref.invalidate(purchaseOrdersProvider); // Refresh the list after deletion
  } catch (e) {
    throw Exception('Failed to delete purchase order: $e');
  }
});

class PurchaseOrdersScreen extends ConsumerStatefulWidget {
  const PurchaseOrdersScreen({super.key});

  @override
  ConsumerState<PurchaseOrdersScreen> createState() => _PurchaseOrdersScreenState();
}

class _PurchaseOrdersScreenState extends ConsumerState<PurchaseOrdersScreen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

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

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'completed':
        return Colors.green;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'USD' ? '\$' : '₦');
    return format.format(amount);
  }

  Future<void> _showOrderDialog({PurchaseOrder? order}) async {
    final isEditing = order != null;
    final TextEditingController customerNameController = TextEditingController(text: order?.customerName);
    final TextEditingController amountController = TextEditingController(text: order?.amount.toString());
    String? selectedCurrency = order?.currency ?? 'USD';
    String? selectedStatus = order?.status ?? 'Pending';

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Purchase Order' : 'Create Purchase Order', style: const TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: customerNameController,
                decoration: InputDecoration(
                  labelText: 'Customer Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: const TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedCurrency,
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
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
                  selectedCurrency = newValue;
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: <String>['Pending', 'Completed', 'Cancelled']
                    .map<DropdownMenuItem<String>>((String value) {
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
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              if (customerNameController.text.isEmpty || amountController.text.isEmpty) {
                // Show error or snackbar
                return;
              }
              final newAmount = double.tryParse(amountController.text);
              if (newAmount == null) {
                // Show error or snackbar
                return;
              }

              final newOrder = PurchaseOrder(
                id: isEditing ? order!.id : DateTime.now().millisecondsSinceEpoch.toString(), // Simple ID generation for new orders
                customerName: customerNameController.text,
                amount: newAmount,
                currency: selectedCurrency!,
                status: selectedStatus!,
                orderDate: isEditing ? order!.orderDate : DateTime.now(),
              );

              if (isEditing) {
                await ref.read(updatePurchaseOrderProvider(newOrder).future);
              } else {
                await ref.read(createPurchaseOrderProvider(newOrder).future);
              }
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Colors.white)),
          ),
        ],
      );
    });
  }

  Future<void> _confirmDelete(String orderId) async {
    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
        content: const Text('Are you sure you want to delete this purchase order?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              await ref.read(deletePurchaseOrderProvider(orderId).future);
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final purchaseOrdersAsyncValue = ref.watch(purchaseOrdersProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Purchase Orders',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(100.0),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by customer name or order ID',
                    hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    fillColor: _cardColor,
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 8.0),
                DropdownButtonFormField<String?>(
                  value: filterStatus,
                  decoration: InputDecoration(
                    hintText: 'Filter by status',
                    hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8.0),
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    fillColor: _cardColor,
                  ),
                  dropdownColor: _cardColor,
                  style: const TextStyle(color: _textColor),
                  items: <String?>['All', 'Pending', 'Completed', 'Cancelled']
                      .map<DropdownMenuItem<String?>>((String? value) {
                    return DropdownMenuItem<String?>(
                      value: value == 'All' ? null : value,
                      child: Text(value ?? 'All'),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    ref.read(filterStatusProvider.notifier).state = newValue;
                  },
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(purchaseOrdersProvider);
          await ref.read(purchaseOrdersProvider.future);
        },
        child: purchaseOrdersAsyncValue.when(
          data: (orders) {
            if (orders.isEmpty) {
              return Center(
                child: Text(
                  'No purchase orders found.',
                  style: TextStyle(color: _textColor),
                ),
              );
            }
            return ListView.builder(
              itemCount: orders.length,
              itemBuilder: (context, index) {
                final order = orders[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Order ID: ${order.id}',
                          style: TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'Customer: ${order.customerName}',
                          style: TextStyle(color: _textColor),
                        ),
                        Text(
                          'Amount: ${_formatCurrency(order.amount, order.currency)}',
                          style: TextStyle(color: _textColor),
                        ),
                        Row(
                          children: [
                            Text(
                              'Status: ',
                              style: TextStyle(color: _textColor),
                            ),
                            Chip(
                              label: Text(order.status),
                              backgroundColor: _getStatusColor(order.status),
                              labelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        Text(
                          'Date: ${DateFormat('yyyy-MM-dd').format(order.orderDate)}',
                          style: TextStyle(color: _textColor),
                        ),
                        const SizedBox(height: 8.0),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () {
                                _showOrderDialog(order: order);
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () {
                                _confirmDelete(order.id);
                              },
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
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: ${error.toString()}',
              style: const TextStyle(color: Colors.red),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showOrderDialog();
        },
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}
