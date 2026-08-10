import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define data models
class InventoryItem {
  final String id;
  final String name;
  final int quantity;
  final double price;
  final String currency;
  final String status;
  final DateTime createdAt;

  InventoryItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.price,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    return InventoryItem(
      id: json['id'] as String,
      name: json['name'] as String,
      quantity: json['quantity'] as int,
      price: (json['price'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

// Riverpod provider for inventory items
final inventoryProvider = FutureProvider.family<List<InventoryItem>, String?>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/inventory.list', params: {'query': query});
  return (response['items'] as List)
      .map((item) => InventoryItem.fromJson(item as Map<String, dynamic>))
      .toList();
});

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _searchQuery;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text.isEmpty ? null : _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshInventory() async {
    ref.invalidate(inventoryProvider(_searchQuery));
  }

  @override
  Widget build(BuildContext context) {
    final inventoryAsyncValue = ref.watch(inventoryProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Inventory', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateItemDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshInventory,
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search inventory...',
                  hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF1e293b), // Card background for search field
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: inventoryAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9))),
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return const Center(
                      child: Text('No inventory items found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b), // Card background
                        child: ListTile(
                          title: Text(item.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Quantity: ${item.quantity}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text(
                                'Price: ${item.currency == 'NGN' ? '₦' : '$'}${item.price.toStringAsFixed(2)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                              ),
                              _buildStatusBadge(item.status),
                              Text(
                                'Created: ${_formatDate(item.createdAt)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6), fontSize: 12.0),
                              ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showEditItemDialog(context, item),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Red for delete
                                onPressed: () => _confirmDeleteItem(context, item.id),
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
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'available':
        badgeColor = Colors.green;
        break;
      case 'low stock':
        badgeColor = Colors.orange;
        break;
      case 'out of stock':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6.0, vertical: 2.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 10.0, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute}';
  }

  Future<void> _showCreateItemDialog(BuildContext context) async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController quantityController = TextEditingController();
    final TextEditingController priceController = TextEditingController();
    String? selectedCurrency = 'NGN'; // Default currency

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Create New Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Item Name',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: quantityController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Quantity',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Price',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedCurrency = newValue;
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
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/inventory.create', body: {
                    'name': nameController.text,
                    'quantity': int.parse(quantityController.text),
                    'price': double.parse(priceController.text),
                    'currency': selectedCurrency,
                  });
                  ref.invalidate(inventoryProvider(_searchQuery)); // Refresh list
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error, e.g., show a snackbar
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create item: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEditItemDialog(BuildContext context, InventoryItem item) async {
    final TextEditingController nameController = TextEditingController(text: item.name);
    final TextEditingController quantityController = TextEditingController(text: item.quantity.toString());
    final TextEditingController priceController = TextEditingController(text: item.price.toString());
    String? selectedCurrency = item.currency; // Default currency

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Edit Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Item Name',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: quantityController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Quantity',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Price',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Currency',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9).withOpacity(0.4))),
                    focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedCurrency = newValue;
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
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/inventory.update', body: {
                    'id': item.id,
                    'name': nameController.text,
                    'quantity': int.parse(quantityController.text),
                    'price': double.parse(priceController.text),
                    'currency': selectedCurrency,
                  });
                  ref.invalidate(inventoryProvider(_searchQuery)); // Refresh list
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update item: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _confirmDeleteItem(BuildContext context, String itemId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card background
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this item?', style: TextStyle(color: Color(0xFFf1f5f9))),
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
                  await api.post('/trpc/inventory.delete', body: {'id': itemId});
                  ref.invalidate(inventoryProvider(_searchQuery)); // Refresh list
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete item: $e', style: const TextStyle(color: Color(0xFFf1f5f9)))),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }
}
