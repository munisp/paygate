import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data Models
class MenuItem {
  final String id;
  final String name;
  final String description;
  final double price;
  final bool isActive;
  final DateTime createdAt;

  MenuItem({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.isActive,
    required this.createdAt,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown',
      description: json['description'] ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0.0,
      isActive: json['isActive'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'price': price,
        'isActive': isActive,
        'createdAt': createdAt.toIso8601String(),
      };

  MenuItem copyWith({
    String? id,
    String? name,
    String? description,
    double? price,
    bool? isActive,
    DateTime? createdAt,
  }) {
    return MenuItem(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      price: price ?? this.price,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

// State Notifier for Menu Items
class MenuItemsNotifier extends StateNotifier<AsyncValue<List<MenuItem>>> {
  MenuItemsNotifier(this.ref) : super(const AsyncValue.loading()) {
    fetchMenuItems();
  }

  final Ref ref;

  Future<void> fetchMenuItems() async {
    try {
      state = const AsyncValue.loading();
      final api = ref.read(apiServiceProvider);
      final response = await api.get('/trpc/menu.list');
      final List<MenuItem> menuItems = (response['menuItems'] as List)
          .map((item) => MenuItem.fromJson(item))
          .toList();
      state = AsyncValue.data(menuItems);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createMenuItem(MenuItem item) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/menu.create', body: item.toJson());
      await fetchMenuItems(); // Refresh list after creation
    } catch (e, st) {
      // Handle error, maybe show a snackbar
      debugPrint('Error creating menu item: $e');
    }
  }

  Future<void> updateMenuItem(MenuItem item) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/menu.update', body: item.toJson());
      await fetchMenuItems(); // Refresh list after update
    } catch (e, st) {
      // Handle error
      debugPrint('Error updating menu item: $e');
    }
  }

  Future<void> deleteMenuItem(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/menu.delete', body: {'id': id});
      await fetchMenuItems(); // Refresh list after deletion
    } catch (e, st) {
      // Handle error
      debugPrint('Error deleting menu item: $e');
    }
  }
}

final menuItemsProvider =
    StateNotifierProvider<MenuItemsNotifier, AsyncValue<List<MenuItem>>>((ref) {
  return MenuItemsNotifier(ref);
});

class MenuManagementScreen extends ConsumerStatefulWidget {
  const MenuManagementScreen({super.key});

  @override
  ConsumerState<MenuManagementScreen> createState() => _MenuManagementScreenState();
}

class _MenuManagementScreenState extends ConsumerState<MenuManagementScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

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
    final menuItemsAsyncValue = ref.watch(menuItemsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('Menu Management', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: Icon(Icons.add, color: _textColor),
            onPressed: () => _showCreateEditDialog(context),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search menu items...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: TextStyle(color: _textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(menuItemsProvider.notifier).fetchMenuItems(),
        child: menuItemsAsyncValue.when(
          loading: () => Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(child: Text('Error: $err', style: TextStyle(color: _textColor))),
          data: (menuItems) {
            final filteredItems = menuItems.where((item) {
              return item.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                  item.description.toLowerCase().contains(_searchQuery.toLowerCase());
            }).toList();

            if (filteredItems.isEmpty) {
              return Center(child: Text('No menu items found.', style: TextStyle(color: _textColor)));
            }
            return ListView.builder(
              itemCount: filteredItems.length,
              itemBuilder: (context, index) {
                final item = filteredItems[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: ListTile(
                    title: Text(item.name, style: TextStyle(color: _textColor)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.description,
                          style: TextStyle(color: _textColor.withOpacity(0.7)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Price: ₦${item.price.toStringAsFixed(2)}',
                          style: TextStyle(color: _textColor.withOpacity(0.7)),
                        ),
                        Text(
                          'Created: ${DateFormat('yyyy-MM-dd HH:mm').format(item.createdAt)}',
                          style: TextStyle(color: _textColor.withOpacity(0.7)),
                        ),
                        _buildStatusBadge(item.isActive),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: Icon(Icons.edit, color: _accentColor),
                          onPressed: () => _showCreateEditDialog(context, item: item),
                        ),
                        IconButton(
                          icon: Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () => _confirmDelete(context, item),
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
    );
  }

  Widget _buildStatusBadge(bool isActive) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: isActive ? Colors.green : Colors.red,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        isActive ? 'Active' : 'Inactive',
        style: TextStyle(color: _textColor, fontSize: 12),
      ),
    );
  }

  Future<void> _showCreateEditDialog(BuildContext context, {MenuItem? item}) async {
    final isEditing = item != null;
    final _nameController = TextEditingController(text: item?.name);
    final _descriptionController = TextEditingController(text: item?.description);
    final _priceController = TextEditingController(text: item?.price.toStringAsFixed(2));
    bool _isActive = item?.isActive ?? false;

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: _cardColor,
              title: Text(isEditing ? 'Edit Menu Item' : 'Create Menu Item', style: TextStyle(color: _textColor)),
              content: SingleChildScrollView(
                child: ListBody(
                  children: <Widget>[
                    TextField(
                      controller: _nameController,
                      decoration: InputDecoration(
                        labelText: 'Name',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                      style: TextStyle(color: _textColor),
                    ),
                    TextField(
                      controller: _descriptionController,
                      decoration: InputDecoration(
                        labelText: 'Description',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                      style: TextStyle(color: _textColor),
                    ),
                    TextField(
                      controller: _priceController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Price (₦)',
                        labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                      ),
                      style: TextStyle(color: _textColor),
                    ),
                    Row(
                      children: [
                        Text('Active:', style: TextStyle(color: _textColor)),
                        Switch(
                          value: _isActive,
                          onChanged: (bool value) {
                            setState(() {
                              _isActive = value;
                            });
                          },
                          activeColor: _accentColor,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(
                  child: Text('Cancel', style: TextStyle(color: _textColor)),
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                ),
                TextButton(
                  child: Text(isEditing ? 'Update' : 'Create', style: TextStyle(color: _accentColor)),
                  onPressed: () {
                    final newMenuItem = MenuItem(
                      id: item?.id ?? UniqueKey().toString(), // Use existing ID or generate new
                      name: _nameController.text,
                      description: _descriptionController.text,
                      price: double.tryParse(_priceController.text) ?? 0.0,
                      isActive: _isActive,
                      createdAt: item?.createdAt ?? DateTime.now(),
                    );
                    if (isEditing) {
                      ref.read(menuItemsProvider.notifier).updateMenuItem(newMenuItem);
                    } else {
                      ref.read(menuItemsProvider.notifier).createMenuItem(newMenuItem);
                    }
                    Navigator.of(dialogContext).pop();
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _confirmDelete(BuildContext context, MenuItem item) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Delete Menu Item', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete ${item.name}?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                ref.read(menuItemsProvider.notifier).deleteMenuItem(item.id);
                Navigator.of(dialogContext).pop();
              },
            ),
          ],
        );
      },
    );
  }
}