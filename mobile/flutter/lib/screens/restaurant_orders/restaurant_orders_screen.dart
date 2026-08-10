import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

/// Data model for a Restaurant Order
class RestaurantOrder {
  final String id;
  final String customerName;
  final String restaurantName;
  final List<OrderItem> items;
  final double totalAmount;
  final String currency;
  final String status;
  final DateTime orderDate;

  RestaurantOrder({
    required this.id,
    required this.customerName,
    required this.restaurantName,
    required this.items,
    required this.totalAmount,
    required this.currency,
    required this.status,
    required this.orderDate,
  });

  factory RestaurantOrder.fromJson(Map<String, dynamic> json) {
    return RestaurantOrder(
      id: json['id'],
      customerName: json['customerName'],
      restaurantName: json['restaurantName'],
      items: (json['items'] as List)
          .map((item) => OrderItem.fromJson(item))
          .toList(),
      totalAmount: json['totalAmount'].toDouble(),
      currency: json['currency'],
      status: json['status'],
      orderDate: DateTime.parse(json['orderDate']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'restaurantName': restaurantName,
        'items': items.map((item) => item.toJson()).toList(),
        'totalAmount': totalAmount,
        'currency': currency,
        'status': status,
        'orderDate': orderDate.toIso8601String(),
      };

  RestaurantOrder copyWith({
    String? id,
    String? customerName,
    String? restaurantName,
    List<OrderItem>? items,
    double? totalAmount,
    String? currency,
    String? status,
    DateTime? orderDate,
  }) {
    return RestaurantOrder(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      restaurantName: restaurantName ?? this.restaurantName,
      items: items ?? this.items,
      totalAmount: totalAmount ?? this.totalAmount,
      currency: currency ?? this.currency,
      status: status ?? this.status,
      orderDate: orderDate ?? this.orderDate,
    );
  }
}

/// Data model for an item within a Restaurant Order
class OrderItem {
  final String name;
  final int quantity;
  final double price;

  OrderItem({
    required this.name,
    required this.quantity,
    required this.price,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      name: json['name'],
      quantity: json['quantity'],
      price: json['price'].toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'quantity': quantity,
        'price': price,
      };

  OrderItem copyWith({
    String? name,
    int? quantity,
    double? price,
  }) {
    return OrderItem(
      name: name ?? this.name,
      quantity: quantity ?? this.quantity,
      price: price ?? this.price,
    );
  }
}

// Riverpod provider for fetching restaurant orders
final restaurantOrdersProvider = FutureProvider.autoDispose<List<RestaurantOrder>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate network delay
    await Future.delayed(const Duration(milliseconds: 500));
    final response = await api.get('/trpc/restaurantOrders.list');
    // Assuming the response is a Map with a 'data' key containing the list of orders
    return (response['data'] as List)
        .map((json) => RestaurantOrder.fromJson(json))
        .toList();
  } catch (e) {
    throw Exception('Failed to load restaurant orders: $e');
  }
});

class RestaurantOrdersScreen extends ConsumerStatefulWidget {
  const RestaurantOrdersScreen({super.key});

  @override
  ConsumerState<RestaurantOrdersScreen> createState() => _RestaurantOrdersScreenState();
}

class _RestaurantOrdersScreenState extends ConsumerState<RestaurantOrdersScreen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  // Text editing controllers for search/filter
  final TextEditingController _searchController = TextEditingController();
  String _searchText = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchText = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _createOrder(BuildContext context, WidgetRef ref) async {
    final TextEditingController customerNameController = TextEditingController();
    final TextEditingController restaurantNameController = TextEditingController();
    final TextEditingController totalAmountController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'USD');
    final TextEditingController statusController = TextEditingController(text: 'Pending');

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Create New Order', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: customerNameController,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: restaurantNameController,
                  decoration: InputDecoration(
                    labelText: 'Restaurant Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: totalAmountController,
                  decoration: InputDecoration(
                    labelText: 'Total Amount',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: currencyController,
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: statusController,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              child: Text('Create', style: TextStyle(color: _textColor)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  final newOrder = RestaurantOrder(
                    id: DateTime.now().millisecondsSinceEpoch.toString(), // Dummy ID
                    customerName: customerNameController.text,
                    restaurantName: restaurantNameController.text,
                    items: [], // For simplicity, no items in create dialog
                    totalAmount: double.parse(totalAmountController.text),
                    currency: currencyController.text,
                    status: statusController.text,
                    orderDate: DateTime.now(),
                  );
                  await api.post('/trpc/restaurantOrders.create', body: newOrder.toJson());
                  ref.invalidate(restaurantOrdersProvider); // Refresh the list
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create order: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _editOrder(BuildContext context, WidgetRef ref, RestaurantOrder order) async {
    final TextEditingController customerNameController = TextEditingController(text: order.customerName);
    final TextEditingController restaurantNameController = TextEditingController(text: order.restaurantName);
    final TextEditingController totalAmountController = TextEditingController(text: order.totalAmount.toString());
    final TextEditingController currencyController = TextEditingController(text: order.currency);
    final TextEditingController statusController = TextEditingController(text: order.status);

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Order', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: customerNameController,
                  decoration: InputDecoration(
                    labelText: 'Customer Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: restaurantNameController,
                  decoration: InputDecoration(
                    labelText: 'Restaurant Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: totalAmountController,
                  decoration: InputDecoration(
                    labelText: 'Total Amount',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: currencyController,
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
                TextField(
                  controller: statusController,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  ),
                  style: TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              child: Text('Save', style: TextStyle(color: _textColor)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  final updatedOrder = order.copyWith(
                    customerName: customerNameController.text,
                    restaurantName: restaurantNameController.text,
                    totalAmount: double.parse(totalAmountController.text),
                    currency: currencyController.text,
                    status: statusController.text,
                  );
                  await api.put('/trpc/restaurantOrders.update', body: updatedOrder.toJson());
                  ref.invalidate(restaurantOrdersProvider); // Refresh the list
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update order: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _deleteOrder(BuildContext context, WidgetRef ref, String orderId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Delete Order', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete this order?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            ElevatedButton(
              child: Text('Delete', style: TextStyle(color: _textColor)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.delete('/trpc/restaurantOrders.delete', params: {'id': orderId});
                  ref.invalidate(restaurantOrdersProvider); // Refresh the list
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete order: $e'))
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'completed':
        badgeColor = Colors.green;
        break;
      case 'cancelled':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: _textColor, fontSize: 12),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    String symbol = '';
    if (currency == 'NGN') {
      symbol = '₦';
    } else if (currency == 'USD') {
      symbol = '$'; // Using unicode for dollar sign
    } else {
      symbol = currency;
    }
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')}-${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final restaurantOrdersAsyncValue = ref.watch(restaurantOrdersProvider);

    return Theme(
      data: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: _backgroundColor,
        cardColor: _cardColor,
        textTheme: TextTheme(
          bodyLarge: TextStyle(color: _textColor),
          bodyMedium: TextStyle(color: _textColor),
          titleLarge: TextStyle(color: _textColor),
          titleMedium: TextStyle(color: _textColor),
          titleSmall: TextStyle(color: _textColor),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: _cardColor,
          foregroundColor: _textColor,
        ),
        floatingActionButtonTheme: FloatingActionButtonThemeData(
          backgroundColor: _accentColor,
          foregroundColor: _textColor,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: _accentColor,
            foregroundColor: _textColor,
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: _accentColor,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          fillColor: _cardColor,
          filled: true,
          labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
          hintStyle: TextStyle(color: _textColor.withOpacity(0.5)),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8.0),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Restaurant Orders'),
          actions: [
            IconButton(
              icon: const Icon(Icons.search),
              onPressed: () {
                showSearch(
                  context: context,
                  delegate: OrderSearchDelegate(
                    ordersFuture: ref.read(restaurantOrdersProvider.future),
                    buildStatusBadge: _buildStatusBadge,
                    formatAmount: _formatAmount,
                    formatDate: _formatDate,
                    editOrder: _editOrder,
                    deleteOrder: _deleteOrder,
                    textColor: _textColor,
                    accentColor: _accentColor,
                    cardColor: _cardColor,
                  ),
                );
              },
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: () => ref.refresh(restaurantOrdersProvider.future),
          child: restaurantOrdersAsyncValue.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Error: $err', style: TextStyle(color: _textColor))),
            data: (orders) {
              if (orders.isEmpty) {
                return Center(
                  child: Text(
                    'No restaurant orders found.',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(color: _textColor),
                  ),
                );
              }
              // Filter orders based on search text
              final filteredOrders = orders.where((order) {
                final lowerCaseSearchText = _searchText.toLowerCase();
                return order.customerName.toLowerCase().contains(lowerCaseSearchText) ||
                       order.restaurantName.toLowerCase().contains(lowerCaseSearchText) ||
                       order.status.toLowerCase().contains(lowerCaseSearchText) ||
                       order.id.toLowerCase().contains(lowerCaseSearchText);
              }).toList();

              if (filteredOrders.isEmpty) {
                return Center(
                  child: Text(
                    'No matching orders found.',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(color: _textColor),
                  ),
                );
              }

              return ListView.builder(
                itemCount: filteredOrders.length,
                itemBuilder: (context, index) {
                  final order = filteredOrders[index];
                  return Card(
                    margin: const EdgeInsets.all(8.0),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Order ID: ${order.id}', style: Theme.of(context).textTheme.titleSmall),
                          Text('Customer: ${order.customerName}', style: Theme.of(context).textTheme.bodyMedium),
                          Text('Restaurant: ${order.restaurantName}', style: Theme.of(context).textTheme.bodyMedium),
                          Row(
                            children: [
                              Text('Total: ${_formatAmount(order.totalAmount, order.currency)}', style: Theme.of(context).textTheme.bodyMedium),
                              const SizedBox(width: 10),
                              _buildStatusBadge(order.status),
                            ],
                          ),
                          Text('Date: ${_formatDate(order.orderDate)}', style: Theme.of(context).textTheme.bodyMedium),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: _accentColor),
                                onPressed: () => _editOrder(context, ref, order),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteOrder(context, ref, order.id),
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
          onPressed: () => _createOrder(context, ref),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}

class OrderSearchDelegate extends SearchDelegate<RestaurantOrder?> {
  final Future<List<RestaurantOrder>> ordersFuture;
  final Function(String) buildStatusBadge;
  final Function(double, String) formatAmount;
  final Function(DateTime) formatDate;
  final Function(BuildContext, WidgetRef, RestaurantOrder) editOrder;
  final Function(BuildContext, WidgetRef, String) deleteOrder;
  final Color textColor;
  final Color accentColor;
  final Color cardColor;

  OrderSearchDelegate({
    required this.ordersFuture,
    required this.buildStatusBadge,
    required this.formatAmount,
    required this.formatDate,
    required this.editOrder,
    required this.deleteOrder,
    required this.textColor,
    required this.accentColor,
    required this.cardColor,
  });

  @override
  ThemeData appBarTheme(BuildContext context) {
    return ThemeData.dark().copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: cardColor,
        foregroundColor: textColor,
      ),
      inputDecorationTheme: InputDecorationTheme(
        hintStyle: TextStyle(color: textColor.withOpacity(0.5)),
        border: InputBorder.none,
      ),
      textTheme: TextTheme(
        titleLarge: TextStyle(color: textColor),
      ),
    );
  }

  @override
  List<Widget>? buildActions(BuildContext context) {
    return [
      IconButton(
        icon: const Icon(Icons.clear),
        onPressed: () {
          query = '';
        },
      ),
    ];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () {
        close(context, null);
      },
    );
  }

  @override
  Widget buildResults(BuildContext context) {
    return FutureBuilder<List<RestaurantOrder>>(
      future: ordersFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        } else if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}', style: TextStyle(color: textColor)));
        } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return Center(child: Text('No orders found.', style: TextStyle(color: textColor)));
        } else {
          final filteredOrders = snapshot.data!.where((order) {
            final lowerCaseQuery = query.toLowerCase();
            return order.customerName.toLowerCase().contains(lowerCaseQuery) ||
                   order.restaurantName.toLowerCase().contains(lowerCaseQuery) ||
                   order.status.toLowerCase().contains(lowerCaseQuery) ||
                   order.id.toLowerCase().contains(lowerCaseQuery);
          }).toList();

          if (filteredOrders.isEmpty) {
            return Center(
              child: Text(
                'No matching orders found.',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: textColor),
              ),
            );
          }

          return ListView.builder(
            itemCount: filteredOrders.length,
            itemBuilder: (context, index) {
              final order = filteredOrders[index];
              return Card(
                color: cardColor,
                margin: const EdgeInsets.all(8.0),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Order ID: ${order.id}', style: Theme.of(context).textTheme.titleSmall),
                      Text('Customer: ${order.customerName}', style: Theme.of(context).textTheme.bodyMedium),
                      Text('Restaurant: ${order.restaurantName}', style: Theme.of(context).textTheme.bodyMedium),
                      Row(
                        children: [
                          Text('Total: ${formatAmount(order.totalAmount, order.currency)}', style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(width: 10),
                          buildStatusBadge(order.status),
                        ],
                      ),
                      Text('Date: ${formatDate(order.orderDate)}', style: Theme.of(context).textTheme.bodyMedium),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Consumer(builder: (context, ref, child) {
                            return IconButton(
                              icon: const Icon(Icons.edit, color: accentColor),
                              onPressed: () => editOrder(context, ref, order),
                            );
                          }),
                          Consumer(builder: (context, ref, child) {
                            return IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => deleteOrder(context, ref, order.id),
                            );
                          }),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        }
      },
    );
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return FutureBuilder<List<RestaurantOrder>>(
      future: ordersFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        } else if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}', style: TextStyle(color: textColor)));
        } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return Center(child: Text('No orders found.', style: TextStyle(color: textColor)));
        } else {
          final suggestionList = query.isEmpty
              ? []
              : snapshot.data!.where((order) {
                  final lowerCaseQuery = query.toLowerCase();
                  return order.customerName.toLowerCase().contains(lowerCaseQuery) ||
                         order.restaurantName.toLowerCase().contains(lowerCaseQuery) ||
                         order.status.toLowerCase().contains(lowerCaseQuery) ||
                         order.id.toLowerCase().contains(lowerCaseQuery);
                }).toList();

          return ListView.builder(
            itemCount: suggestionList.length,
            itemBuilder: (context, index) {
              final order = suggestionList[index];
              return ListTile(
                title: Text(order.customerName, style: TextStyle(color: textColor)),
                subtitle: Text(order.restaurantName, style: TextStyle(color: textColor.withOpacity(0.7))), 
                onTap: () {
                  query = order.customerName; // Or order ID, depending on desired search behavior
                  showResults(context);
                },
              );
            },
          );
        }
      },
    );
  }
}