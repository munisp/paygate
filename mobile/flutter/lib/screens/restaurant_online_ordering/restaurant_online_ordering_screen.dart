import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // Required for advanced date and currency formatting. Add `intl: ^0.18.1` (or latest) to your pubspec.yaml

// Data Models
class OrderItem {
  final String id;
  final String name;
  final int quantity;
  final double price;

  OrderItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.price,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      id: json['id'],
      name: json['name'],
      quantity: json['quantity'],
      price: (json['price'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'quantity': quantity,
        'price': price,
      };
}

class Order {
  final String id;
  final String customerName;
  final String status;
  final double totalAmount;
  final DateTime orderDate;
  final List<OrderItem> items;

  Order({
    required this.id,
    required this.customerName,
    required this.status,
    required this.totalAmount,
    required this.orderDate,
    required this.items,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'],
      customerName: json['customerName'],
      status: json['status'],
      totalAmount: (json['totalAmount'] as num).toDouble(),
      orderDate: DateTime.parse(json['orderDate']),
      items: (json['items'] as List)
          .map((itemJson) => OrderItem.fromJson(itemJson))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'status': status,
        'totalAmount': totalAmount,
        'orderDate': orderDate.toIso8601String(),
        'items': items.map((item) => item.toJson()).toList(),
      };

  Order copyWith({
    String? id,
    String? customerName,
    String? status,
    double? totalAmount,
    DateTime? orderDate,
    List<OrderItem>? items,
  }) {
    return Order(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      status: status ?? this.status,
      totalAmount: totalAmount ?? this.totalAmount,
      orderDate: orderDate ?? this.orderDate,
      items: items ?? this.items,
    );
  }
}

// State Management
class OrdersNotifier extends AsyncNotifier<List<Order>> {
  String _searchQuery = '';
  String _filterStatus = 'All';

  @override
  Future<List<Order>> build() async {
    return _fetchOrders();
  }

  Future<List<Order>> _fetchOrders() async {
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.get('/trpc/restaurantOnlineOrdering.list', params: {
        'searchQuery': _searchQuery,
        'filterStatus': _filterStatus,
      });
      // Assuming response.data is a List<Map<String, dynamic>>
      return (response.data as List)
          .map((json) => Order.fromJson(json))
          .toList();
    } catch (e) {
      // Handle error, e.g., log it or throw a custom exception
      throw Exception('Failed to fetch orders: $e');
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    ref.invalidateSelf();
  }

  void setFilterStatus(String status) {
    _filterStatus = status;
    ref.invalidateSelf();
  }

  Future<void> addOrder(Order newOrder) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/restaurantOnlineOrdering.create', body: newOrder.toJson());
      state = AsyncValue.data(await _fetchOrders());
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> updateOrder(Order updatedOrder) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/restaurantOnlineOrdering.update', body: updatedOrder.toJson());
      state = AsyncValue.data(await _fetchOrders());
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> deleteOrder(String orderId) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/restaurantOnlineOrdering.delete', body: {'id': orderId});
      state = AsyncValue.data(await _fetchOrders());
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> refreshOrders() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _fetchOrders());
  }
}

final ordersProvider = AsyncNotifierProvider<OrdersNotifier, List<Order>>(() {
  return OrdersNotifier();
});

class RestaurantOnlineOrderingScreen extends ConsumerStatefulWidget {
  const RestaurantOnlineOrderingScreen({super.key});

  @override
  ConsumerState<RestaurantOnlineOrderingScreen> createState() => _RestaurantOnlineOrderingScreenState();
}

class _RestaurantOnlineOrderingScreenState extends ConsumerState<RestaurantOnlineOrderingScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _selectedFilterStatus = 'All';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(ordersProvider.notifier).setSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsyncValue = ref.watch(ordersProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Restaurant Online Ordering', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Dark card/app bar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () {
              _showCreateOrderDialog(context);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                labelText: 'Search by Customer Name or Order ID',
                labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              onChanged: (query) {
                ref.read(ordersProvider.notifier).setSearchQuery(query);
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0),
            child: DropdownButtonFormField<String>(
              value: _selectedFilterStatus,
              dropdownColor: const Color(0xFF1e293b),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                labelText: 'Filter by Status',
                labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: const BorderSide(color: Color(0xFF6366f1), width: 2.0),
                ),
              ),
              items: <String>['All', 'Pending', 'Completed', 'Cancelled']
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
                  ref.read(ordersProvider.notifier).setFilterStatus(newValue);
                }
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(ordersProvider.notifier).refreshOrders(),
              child: ordersAsyncValue.when(
                data: (orders) {
                  if (orders.isEmpty) {
                    return const Center(
                      child: Text(
                        'No orders found.',
                        style: TextStyle(color: Color(0xFFf1f5f9)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.all(8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Order ID: ${order.id}',
                                style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Customer: ${order.customerName}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Status: ${order.status}',
                                style: TextStyle(color: _getStatusColor(order.status)),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Amount: ${formatCurrency(order.totalAmount, 'NGN')}', // Use NGN for Naira
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Date: ${formatDate(order.orderDate)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 8),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                      onPressed: () {
                                        _showEditOrderDialog(context, order);
                                      },
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete, color: Colors.redAccent),
                                      onPressed: () {
                                        _showDeleteConfirmationDialog(context, order);
                                      },
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
                error: (err, stack) => Center(
                  child: Text(
                    'Error: $err',
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
          _showCreateOrderDialog(context);
        },
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orangeAccent;
      case 'completed':
        return Colors.greenAccent;
      case 'cancelled':
        return Colors.redAccent;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String formatCurrency(double amount, String currencyCode) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currencyCode == 'NGN' ? '₦' : '\$');
    return format.format(amount);
  }

  String formatDate(DateTime date) {
    return DateFormat('dd/MM/yyyy').format(date);
  }

  void _showCreateOrderDialog(BuildContext context) {
    final TextEditingController customerNameController = TextEditingController();
    final TextEditingController totalAmountController = TextEditingController();
    final TextEditingController itemNameController = TextEditingController();
    final TextEditingController itemQuantityController = TextEditingController();
    final TextEditingController itemPriceController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Order', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: totalAmountController,
                  decoration: const InputDecoration(
                    labelText: 'Total Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                const Text('Order Items', style: TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                TextField(
                  controller: itemNameController,
                  decoration: const InputDecoration(
                    labelText: 'Item Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: itemQuantityController,
                  decoration: const InputDecoration(
                    labelText: 'Item Quantity',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: itemPriceController,
                  decoration: const InputDecoration(
                    labelText: 'Item Price',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                final newOrder = Order(
                  id: DateTime.now().millisecondsSinceEpoch.toString(), // Dummy ID
                  customerName: customerNameController.text,
                  status: 'Pending', // Default status
                  totalAmount: double.tryParse(totalAmountController.text) ?? 0.0,
                  orderDate: DateTime.now(),
                  items: [
                    OrderItem(
                      id: DateTime.now().millisecondsSinceEpoch.toString() + 'item',
                      name: itemNameController.text,
                      quantity: int.tryParse(itemQuantityController.text) ?? 1,
                      price: double.tryParse(itemPriceController.text) ?? 0.0,
                    ),
                  ], // Simplified for dialog
                );
                ref.read(ordersProvider.notifier).addOrder(newOrder);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditOrderDialog(BuildContext context, Order order) {
    final TextEditingController customerNameController = TextEditingController(text: order.customerName);
    final TextEditingController totalAmountController = TextEditingController(text: order.totalAmount.toString());
    final TextEditingController statusController = TextEditingController(text: order.status);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Order', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: totalAmountController,
                  decoration: const InputDecoration(
                    labelText: 'Total Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
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
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                final updatedOrder = order.copyWith(
                  customerName: customerNameController.text,
                  totalAmount: double.tryParse(totalAmountController.text) ?? order.totalAmount,
                  status: statusController.text,
                );
                ref.read(ordersProvider.notifier).updateOrder(updatedOrder);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, Order order) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Order', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete order ${order.id}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                ref.read(ordersProvider.notifier).deleteOrder(order.id);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
