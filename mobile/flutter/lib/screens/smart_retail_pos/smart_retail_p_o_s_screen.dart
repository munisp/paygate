import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date and currency formatting
import '../../services/api_service.dart';

// Define a simple data model for SmartRetailPOS items
class SmartRetailPOSItem {
  final String id;
  final String name;
  final double price;
  final int quantity;
  final DateTime createdAt;
  final String status; // Added status field

  SmartRetailPOSItem({
    required this.id,
    required this.name,
    required this.price,
    required this.quantity,
    required this.createdAt,
    required this.status,
  });

  factory SmartRetailPOSItem.fromJson(Map<String, dynamic> json) {
    return SmartRetailPOSItem(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toDouble(),
      quantity: json['quantity'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
      status: json['status'] as String? ?? 'Available', // Default status
    );
  }

  SmartRetailPOSItem copyWith({
    String? id,
    String? name,
    double? price,
    int? quantity,
    DateTime? createdAt,
    String? status,
  }) {
    return SmartRetailPOSItem(
      id: id ?? this.id,
      name: name ?? this.name,
      price: price ?? this.price,
      quantity: quantity ?? this.quantity,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
    );
  }
}

// StateNotifier for managing SmartRetailPOS items
class SmartRetailPOSItemsNotifier extends StateNotifier<AsyncValue<List<SmartRetailPOSItem>>> {
  final ApiService apiService;

  SmartRetailPOSItemsNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchItems();
  }

  Future<void> fetchItems() async {
    state = const AsyncValue.loading();
    try {
      final response = await apiService.get('/trpc/smartRetailPOS.list', params: {});
      final List<SmartRetailPOSItem> items = (response['items'] as List)
          .map((itemJson) => SmartRetailPOSItem.fromJson(itemJson))
          .toList();
      state = AsyncValue.data(items);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createItem(String name, double price, int quantity, String status) async {
    try {
      final response = await apiService.post(
        '/trpc/smartRetailPOS.create',
        body: {'name': name, 'price': price, 'quantity': quantity, 'status': status},
      );
      final newItem = SmartRetailPOSItem.fromJson(response);
      state.whenData((items) => state = AsyncValue.data([...items, newItem]));
    } catch (e, st) {
      debugPrint('Error creating item: $e');
    }
  }

  Future<void> updateItem(String id, String name, double price, int quantity, String status) async {
    try {
      final response = await apiService.post(
        '/trpc/smartRetailPOS.update',
        body: {'id': id, 'name': name, 'price': price, 'quantity': quantity, 'status': status},
      );
      final updatedItem = SmartRetailPOSItem.fromJson(response);
      state.whenData((items) {
        state = AsyncValue.data([
          for (final item in items)
            if (item.id == id) updatedItem else item,
        ]);
      });
    } catch (e, st) {
      debugPrint('Error updating item: $e');
    }
  }

  Future<void> deleteItem(String id) async {
    try {
      await apiService.post(
        '/trpc/smartRetailPOS.delete',
        body: {'id': id},
      );
      state.whenData((items) {
        state = AsyncValue.data(items.where((item) => item.id != id).toList());
      });
    } catch (e, st) {
      debugPrint('Error deleting item: $e');
    }
  }
}

// Provider for SmartRetailPOSItemsNotifier
final smartRetailPOSItemsProvider = StateNotifierProvider<
    SmartRetailPOSItemsNotifier, AsyncValue<List<SmartRetailPOSItem>>>((ref) {
  return SmartRetailPOSItemsNotifier(ref.read(apiServiceProvider));
});

class SmartRetailPOSScreen extends ConsumerStatefulWidget {
  const SmartRetailPOSScreen({super.key});

  @override
  ConsumerState<SmartRetailPOSScreen> createState() => _SmartRetailPOSScreenState();
}

class _SmartRetailPOSScreenState extends ConsumerState<SmartRetailPOSScreen> {
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

  @override
  Widget build(BuildContext context) {
    final itemsAsyncValue = ref.watch(smartRetailPOSItemsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // dark theme background
      appBar: AppBar(
        title: const Text('SmartRetailPOS', style: TextStyle(color: Color(0xFFf1f5f9))), // dark theme text
        backgroundColor: const Color(0xFF1e293b), // dark theme card
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // dark theme text for icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search items...',
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF334155),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(smartRetailPOSItemsProvider.notifier).fetchItems(),
        child: itemsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // accent color
          error: (err, stack) => Center(
            child: Text(
              'Error: ${err.toString()}',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          data: (items) {
            final filteredItems = items.where((item) {
              return item.name.toLowerCase().contains(_searchQuery.toLowerCase());
            }).toList();

            if (filteredItems.isEmpty) {
              return Center(
                child: Text(
                  _searchQuery.isEmpty ? 'No SmartRetailPOS items found.' : 'No items found for "$_searchQuery".',
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: filteredItems.length,
              itemBuilder: (context, index) {
                final item = filteredItems[index];
                return Card(
                  color: const Color(0xFF1e293b), // dark theme card
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              item.name,
                              style: const TextStyle(
                                color: Color(0xFFf1f5f9),
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            _buildStatusBadge(item.status), // Status badge
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Price: ${NumberFormat.currency(locale: 'en_NG', symbol: '₦').format(item.price)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Quantity: ${item.quantity}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Created: ${DateFormat('yyyy-MM-dd HH:mm').format(item.createdAt.toLocal())}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () => _showUpsertDialog(context, item: item),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _confirmDelete(context, item.id),
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
        onPressed: () => _showUpsertDialog(context),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'available':
        badgeColor = Colors.green;
        break;
      case 'out of stock':
        badgeColor = Colors.red;
        break;
      case 'limited':
        badgeColor = Colors.orange;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  void _showUpsertDialog(BuildContext context, {SmartRetailPOSItem? item}) {
    final isEditing = item != null;
    final nameController = TextEditingController(text: item?.name);
    final priceController = TextEditingController(text: item?.price.toString());
    final quantityController = TextEditingController(text: item?.quantity.toString());
    final statusController = TextEditingController(text: item?.status);

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit Item' : 'Add New Item', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: priceController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Price',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: quantityController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Quantity',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: statusController,
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                final name = nameController.text;
                final price = double.tryParse(priceController.text) ?? 0.0;
                final quantity = int.tryParse(quantityController.text) ?? 0;
                final status = statusController.text.isNotEmpty ? statusController.text : 'Available';

                if (name.isNotEmpty && price > 0 && quantity >= 0) {
                  if (isEditing) {
                    ref.read(smartRetailPOSItemsProvider.notifier).updateItem(item!.id, name, price, quantity, status);
                  } else {
                    ref.read(smartRetailPOSItemsProvider.notifier).createItem(name, price, quantity, status);
                  }
                  Navigator.of(context).pop();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please fill all fields correctly.')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: Text(isEditing ? 'Save' : 'Add', style: const TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(BuildContext context, String itemId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this item?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                ref.read(smartRetailPOSItemsProvider.notifier).deleteItem(itemId);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }
}
