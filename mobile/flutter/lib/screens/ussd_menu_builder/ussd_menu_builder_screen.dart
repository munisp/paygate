import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define data model for USSD Menu Item
class UssdMenuItem {
  final String id;
  String name;
  String status; // e.g., 'Active', 'Inactive'
  DateTime createdAt;
  double price; // Example for amount formatting

  UssdMenuItem({
    required this.id,
    required this.name,
    required this.status,
    required this.createdAt,
    required this.price,
  });

  factory UssdMenuItem.fromJson(Map<String, dynamic> json) {
    return UssdMenuItem(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
      price: (json['price'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
      'price': price,
    };
  }
}

// Riverpod providers
final ussdMenuItemsProvider = FutureProvider.family<List<UssdMenuItem>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // In a real scenario, you'd pass the query to the API
  final response = await api.get('/trpc/ussd.menuBuilder.list', params: {'query': query});
  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  final List<UssdMenuItem> mockData = [
    UssdMenuItem(id: '1', name: 'Main Menu', status: 'Active', createdAt: DateTime.now().subtract(const Duration(days: 10)), price: 1500.0),
    UssdMenuItem(id: '2', name: 'Balance Inquiry', status: 'Inactive', createdAt: DateTime.now().subtract(const Duration(days: 5)), price: 500.0),
    UssdMenuItem(id: '3', name: 'Fund Transfer', status: 'Active', createdAt: DateTime.now().subtract(const Duration(days: 20)), price: 2500.0),
    UssdMenuItem(id: '4', name: 'Airtime Purchase', status: 'Active', createdAt: DateTime.now().subtract(const Duration(days: 3)), price: 1000.0),
  ];
  if (query.isEmpty) return mockData;
  return mockData.where((item) => item.name.toLowerCase().contains(query.toLowerCase())).toList();
});

final ussdMenuActionsProvider = Provider((ref) => UssdMenuActions(ref));

class UssdMenuActions {
  final Ref _ref;
  UssdMenuActions(this._ref);

  Future<void> createMenuItem(UssdMenuItem item) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/ussd.menuBuilder.create', body: item.toJson());
    _ref.invalidate(ussdMenuItemsProvider);
  }

  Future<void> updateMenuItem(UssdMenuItem item) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/ussd.menuBuilder.update', body: item.toJson());
    _ref.invalidate(ussdMenuItemsProvider);
  }

  Future<void> deleteMenuItem(String id) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/ussd.menuBuilder.delete', body: {'id': id});
    _ref.invalidate(ussdMenuItemsProvider);
  }
}

class UssdMenuBuilderScreen extends ConsumerStatefulWidget {
  const UssdMenuBuilderScreen({super.key});

  @override
  ConsumerState<UssdMenuBuilderScreen> createState() => _UssdMenuBuilderScreenState();
}

class _UssdMenuBuilderScreenState extends ConsumerState<UssdMenuBuilderScreen> {
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
    ref.invalidate(ussdMenuItemsProvider);
    await ref.read(ussdMenuItemsProvider(_searchQuery).future);
  }

  void _showCreateEditDialog({UssdMenuItem? item}) {
    final isEditing = item != null;
    final TextEditingController nameController = TextEditingController(text: item?.name);
    String? selectedStatus = item?.status ?? 'Active';
    final TextEditingController priceController = TextEditingController(text: item?.price.toStringAsFixed(2));

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit USSD Menu Item' : 'Create USSD Menu Item', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Menu Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  items: <String>['Active', 'Inactive'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.number, // Assuming price is a number
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameController.text.isEmpty || selectedStatus == null || priceController.text.isEmpty) {
                  // Basic validation
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please fill all fields')),
                  );
                  return;
                }
                final newPrice = double.tryParse(priceController.text) ?? 0.0;
                if (isEditing) {
                  final updatedItem = UssdMenuItem(
                    id: item!.id,
                    name: nameController.text,
                    status: selectedStatus!,
                    createdAt: item.createdAt,
                    price: newPrice,
                  );
                  await ref.read(ussdMenuActionsProvider).updateMenuItem(updatedItem);
                } else {
                  final newItem = UssdMenuItem(
                    id: DateTime.now().millisecondsSinceEpoch.toString(), // Mock ID
                    name: nameController.text,
                    status: selectedStatus!,
                    createdAt: DateTime.now(),
                    price: newPrice,
                  );
                  await ref.read(ussdMenuActionsProvider).createMenuItem(newItem);
                }
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(UssdMenuItem item) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete USSD Menu Item', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete "${item.name}"?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () async {
                await ref.read(ussdMenuActionsProvider).deleteMenuItem(item.id);
                if (mounted) Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final ussdMenuItemsAsyncValue = ref.watch(ussdMenuItemsProvider(_searchQuery));

    return Theme(
      data: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0f172a),
        cardColor: const Color(0xFF1e293b),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: Color(0xFFf1f5f9)),
          bodyMedium: TextStyle(color: Color(0xFFf1f5f9)),
          titleLarge: TextStyle(color: Color(0xFFf1f5f9)),
          titleMedium: TextStyle(color: Color(0xFFf1f5f9)),
          titleSmall: TextStyle(color: Color(0xFFf1f5f9)),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1e293b),
          foregroundColor: Color(0xFFf1f5f9),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
          hintStyle: TextStyle(color: Color(0xFF94a3b8)),
          enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
          focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
          border: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF6366f1),
            foregroundColor: const Color(0xFFf1f5f9),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFFf1f5f9),
          ),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xFF6366f1),
          foregroundColor: Color(0xFFf1f5f9),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('USSD Menu Builder'),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showCreateEditDialog(),
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
                  hintText: 'Search menu items...', 
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, color: Color(0xFFf1f5f9)),
                          onPressed: () {
                            _searchController.clear();
                            setState(() {
                              _searchQuery = '';
                            });
                          },
                        )
                      : null,
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: ussdMenuItemsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent))),
                data: (items) {
                  if (items.isEmpty) {
                    return const Center(
                      child: Text('No USSD menu items found.', style: TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: _refreshData,
                    color: const Color(0xFF6366f1),
                    backgroundColor: const Color(0xFF1e293b),
                    child: ListView.builder(
                      itemCount: items.length,
                      itemBuilder: (context, index) {
                        final item = items[index];
                        return Card(
                          margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9))),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    _buildStatusBadge(item.status),
                                    const SizedBox(width: 8),
                                    Text('Created: ${_formatDate(item.createdAt)}', style: const TextStyle(color: Color(0xFF94a3b8))),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text('Price: ${_formatAmount(item.price)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
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
                    ),
                  );
                },
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showCreateEditDialog(),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'Active':
        color = Colors.green;
        break;
      case 'Inactive':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(status, style: TextStyle(color: color, fontSize: 12)),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}'; // Simple format
  }

  String _formatAmount(double amount) {
    // Example: Naira (₦) or USD ($)
    return '₦${amount.toStringAsFixed(2)}'; // Assuming Naira for now
  }
}
