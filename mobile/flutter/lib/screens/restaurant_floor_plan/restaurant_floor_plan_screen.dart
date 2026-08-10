import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Data model for a floor plan item
class FloorPlanItem {
  final String id;
  final String name;
  final String status;
  final int capacity;
  final String type;
  final double price;
  final DateTime lastUpdated;

  FloorPlanItem({
    required this.id,
    required this.name,
    required this.status,
    required this.capacity,
    required this.type,
    required this.price,
    required this.lastUpdated,
  });

  factory FloorPlanItem.fromJson(Map<String, dynamic> json) {
    return FloorPlanItem(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      capacity: json['capacity'] as int,
      type: json['type'] as String,
      price: (json['price'] as num).toDouble(),
      lastUpdated: DateTime.parse(json['lastUpdated'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'capacity': capacity,
        'type': type,
        'price': price,
        'lastUpdated': lastUpdated.toIso8601String(),
      };
}

// Riverpod provider for fetching floor plan data with search/filter
final restaurantFloorPlanProvider = FutureProvider.autoDispose.family<List<FloorPlanItem>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call with dummy data for now, replace with real API call
    // final response = await api.get('/trpc/restaurant.floorPlan.list', params: {'query': query});
    // return (response.data as List).map((item) => FloorPlanItem.fromJson(item)).toList();

    // Dummy data for demonstration
    await Future.delayed(const Duration(seconds: 1));
    final dummyData = [
      {
        'id': '1',
        'name': 'Table 1',
        'status': 'Available',
        'capacity': 4,
        'type': 'Indoor',
        'price': 1500.00,
        'lastUpdated': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
      },
      {
        'id': '2',
        'name': 'Table 2',
        'status': 'Occupied',
        'capacity': 2,
        'type': 'Outdoor',
        'price': 1000.00,
        'lastUpdated': DateTime.now().subtract(const Duration(hours: 5)).toIso8601String(),
      },
      {
        'id': '3',
        'name': 'Booth 1',
        'status': 'Cleaning',
        'capacity': 6,
        'type': 'Indoor',
        'price': 2500.00,
        'lastUpdated': DateTime.now().subtract(const Duration(minutes: 30)).toIso8601String(),
      },
      {
        'id': '4',
        'name': 'Table 3',
        'status': 'Available',
        'capacity': 4,
        'type': 'Indoor',
        'price': 1500.00,
        'lastUpdated': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
      },
    ];

    final filteredData = dummyData.where((item) {
      final lowerCaseQuery = query.toLowerCase();
      return item['name']!.toLowerCase().contains(lowerCaseQuery) ||
             item['status']!.toLowerCase().contains(lowerCaseQuery) ||
             item['type']!.toLowerCase().contains(lowerCaseQuery);
    }).toList();

    return filteredData.map((item) => FloorPlanItem.fromJson(item)).toList();

  } catch (e) {
    throw Exception('Failed to load floor plan: $e');
  }
});

class RestaurantFloorPlanScreen extends ConsumerStatefulWidget {
  const RestaurantFloorPlanScreen({super.key});

  @override
  ConsumerState<RestaurantFloorPlanScreen> createState() => _RestaurantFloorPlanScreenState();
}

class _RestaurantFloorPlanScreenState extends ConsumerState<RestaurantFloorPlanScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final _currencyFormatter = NumberFormat.currency(locale: 'en_US', symbol: '₦'); // Naira symbol
  final _dateFormatter = DateFormat('MMM dd, yyyy HH:mm');

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

  Future<void> _createFloorPlanItem(FloorPlanItem newItem) async {
    final api = ref.read(apiServiceProvider);
    try {
      // await api.post('/trpc/restaurant.floorPlan.create', body: newItem.toJson());
      // Simulate API call
      await Future.delayed(const Duration(milliseconds: 500));
      ref.invalidate(restaurantFloorPlanProvider(_searchQuery)); // Refresh the list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Floor plan item created successfully!')), 
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create item: $e')), 
        );
      }
    }
  }

  Future<void> _editFloorPlanItem(FloorPlanItem updatedItem) async {
    final api = ref.read(apiServiceProvider);
    try {
      // await api.post('/trpc/restaurant.floorPlan.update', body: updatedItem.toJson());
      // Simulate API call
      await Future.delayed(const Duration(milliseconds: 500));
      ref.invalidate(restaurantFloorPlanProvider(_searchQuery)); // Refresh the list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Floor plan item updated successfully!')), 
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update item: $e')), 
        );
      }
    }
  }

  Future<void> _deleteFloorPlanItem(String itemId) async {
    final api = ref.read(apiServiceProvider);
    try {
      // await api.post('/trpc/restaurant.floorPlan.delete', body: {'id': itemId});
      // Simulate API call
      await Future.delayed(const Duration(milliseconds: 500));
      ref.invalidate(restaurantFloorPlanProvider(_searchQuery)); // Refresh the list
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Floor plan item deleted successfully!')), 
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete item: $e')), 
        );
      }
    }
  }

  void _showCreateEditDialog({FloorPlanItem? item}) {
    final isEditing = item != null;
    final _nameController = TextEditingController(text: item?.name);
    final _capacityController = TextEditingController(text: item?.capacity.toString());
    final _typeController = TextEditingController(text: item?.type);
    final _statusController = TextEditingController(text: item?.status);
    final _priceController = TextEditingController(text: item?.price.toString());

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text(isEditing ? 'Edit Floor Plan Item' : 'Create Floor Plan Item', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    labelText: 'Name',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _capacityController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Capacity',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _typeController,
                  decoration: InputDecoration(
                    labelText: 'Type',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _statusController,
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _priceController,
                  keyboardType: TextInputType.number, // Allow decimal input
                  decoration: InputDecoration(
                    labelText: 'Price (₦)', // Naira symbol
                    labelStyle: const TextStyle(color: _textColor),
                    enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
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
              onPressed: () {
                final name = _nameController.text;
                final capacity = int.tryParse(_capacityController.text) ?? 0;
                final type = _typeController.text;
                final status = _statusController.text;
                final price = double.tryParse(_priceController.text) ?? 0.0;

                if (name.isNotEmpty && capacity > 0 && type.isNotEmpty && status.isNotEmpty && price >= 0) {
                  final newItem = FloorPlanItem(
                    id: isEditing ? item!.id : UniqueKey().toString(), // Use existing ID for edit, new for create
                    name: name,
                    capacity: capacity,
                    type: type,
                    status: status,
                    price: price,
                    lastUpdated: DateTime.now(),
                  );
                  if (isEditing) {
                    _editFloorPlanItem(newItem);
                  } else {
                    _createFloorPlanItem(newItem);
                  }
                  Navigator.of(context).pop();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please fill all fields correctly and ensure price is non-negative.')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: _textColor)),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(FloorPlanItem item) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete ${item.name}?', style: const TextStyle(color: _textColor)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
            ),
            ElevatedButton(
              onPressed: () {
                _deleteFloorPlanItem(item.id);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: _textColor)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'available':
        badgeColor = Colors.green;
        break;
      case 'occupied':
        badgeColor = Colors.red;
        break;
      case 'cleaning':
        badgeColor = Colors.orange;
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
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final floorPlanAsyncValue = ref.watch(restaurantFloorPlanProvider(_searchQuery));

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Restaurant Floor Plan', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search floor plans...', 
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(restaurantFloorPlanProvider(_searchQuery).future),
        color: _accentColor,
        child: floorPlanAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
            ),
          ),
          data: (floorPlanItems) {
            if (floorPlanItems.isEmpty) {
              return Center(
                child: Text(
                  'No floor plan data available for the current search.',
                  style: TextStyle(color: _textColor, fontSize: 18),
                  textAlign: TextAlign.center,
                ),
              );
            }
            return ListView.builder(
              itemCount: floorPlanItems.length,
              itemBuilder: (context, index) {
                final item = floorPlanItems[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(item.name, style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold)),
                            _buildStatusBadge(item.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('Type: ${item.type}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        Text('Capacity: ${item.capacity}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        Text('Price: ${_currencyFormatter.format(item.price)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        Text('Last Updated: ${_dateFormatter.format(item.lastUpdated)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showCreateEditDialog(item: item),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteConfirmationDialog(item),
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
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
