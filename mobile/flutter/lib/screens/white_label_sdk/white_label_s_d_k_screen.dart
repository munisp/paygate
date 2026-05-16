import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Placeholder for WhiteLabelSDK data model
class WhiteLabelSDKItem {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime createdAt;

  WhiteLabelSDKItem({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.createdAt,
  });

  factory WhiteLabelSDKItem.fromJson(Map<String, dynamic> json) {
    return WhiteLabelSDKItem(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      amount: (json['amount'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'amount': amount,
        'createdAt': createdAt.toIso8601String(),
      };

  WhiteLabelSDKItem copyWith({
    String? id,
    String? name,
    String? status,
    double? amount,
    DateTime? createdAt,
  }) {
    return WhiteLabelSDKItem(
      id: id ?? this.id,
      name: name ?? this.name,
      status: status ?? this.status,
      amount: amount ?? this.amount,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

// StateNotifier for managing WhiteLabelSDK items
class WhiteLabelSDKNotifier extends StateNotifier<List<WhiteLabelSDKItem>> {
  WhiteLabelSDKNotifier() : super([]);

  void setItems(List<WhiteLabelSDKItem> items) {
    state = items;
  }

  void add(WhiteLabelSDKItem item) {
    state = [...state, item];
  }

  void updateItem(WhiteLabelSDKItem updatedItem) {
    state = [
      for (final item in state)
        if (item.id == updatedItem.id) updatedItem else item,
    ];
  }

  void remove(String id) {
    state = state.where((item) => item.id != id).toList();
  }
}

final whiteLabelSDKNotifierProvider = StateNotifierProvider<WhiteLabelSDKNotifier, List<WhiteLabelSDKItem>>((ref) {
  return WhiteLabelSDKNotifier();
});

// FutureProvider to fetch WhiteLabelSDK data
final whiteLabelSDKListProvider = FutureProvider.autoDispose<List<WhiteLabelSDKItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Assuming a tRPC router 'whiteLabelSDK' and procedure 'list'
  // Adjust as per actual API documentation
  try {
    final response = await api.get('/trpc/whiteLabelSDK.list');
    final List<dynamic> data = response['items'] ?? []; // Assuming 'items' key in response
    final items = data.map((json) => WhiteLabelSDKItem.fromJson(json)).toList();
    ref.read(whiteLabelSDKNotifierProvider.notifier).setItems(items);
    return items;
  } catch (e) {
    // Handle error, e.g., log it or show a toast
    print('Error fetching WhiteLabelSDK list: $e');
    throw e; // Re-throw to be caught by AsyncValue.error
  }
});

final searchQueryProvider = StateProvider<String>((ref) => '');
final filterStatusProvider = StateProvider<String?>((ref) => null);

class WhiteLabelSDKScreen extends ConsumerStatefulWidget {
  const WhiteLabelSDKScreen({super.key});

  @override
  ConsumerState<WhiteLabelSDKScreen> createState() => _WhiteLabelSDKScreenState();
}

class _WhiteLabelSDKScreenState extends ConsumerState<WhiteLabelSDKScreen> {
  // Define theme colors
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

  Future<void> _refreshData() async {
    ref.invalidate(whiteLabelSDKListProvider);
    await ref.read(whiteLabelSDKListProvider.future);
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'inactive':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount) {
    final formatCurrency = NumberFormat.currency(locale: 'en_US', symbol: '₦'); // Naira symbol
    // Or for USD: NumberFormat.currency(locale: 'en_US', symbol: '$'); // USD symbol
    return formatCurrency.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  Future<void> _showCreateEditDialog({WhiteLabelSDKItem? item}) async {
    final isEditing = item != null;
    final nameController = TextEditingController(text: item?.name);
    final amountController = TextEditingController(text: item?.amount.toString());
    String? selectedStatus = item?.status;

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text(isEditing ? 'Edit Item' : 'Create New Item', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: _cardColor,
                  style: TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  items: <String>['active', 'pending', 'inactive'].map((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: TextStyle(color: _textColor)),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
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
              child: Text(isEditing ? 'Save' : 'Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                final newName = nameController.text;
                final newAmount = double.tryParse(amountController.text) ?? 0.0;
                final newStatus = selectedStatus ?? 'pending';

                if (newName.isNotEmpty) {
                  try {
                    final api = ref.read(apiServiceProvider);
                    if (isEditing) {
                      await api.post('/trpc/whiteLabelSDK.update', body: {
                        'id': item!.id,
                        'name': newName,
                        'amount': newAmount,
                        'status': newStatus,
                      });
                      final updatedItem = item.copyWith(
                        name: newName,
                        amount: newAmount,
                        status: newStatus,
                      );
                      ref.read(whiteLabelSDKNotifierProvider.notifier).updateItem(updatedItem);
                      _showSnackBar('Item updated successfully!');
                    } else {
                      final response = await api.post('/trpc/whiteLabelSDK.create', body: {
                        'name': newName,
                        'amount': newAmount,
                        'status': newStatus,
                      });
                      // Assuming API returns the created item with an ID
                      final newItem = WhiteLabelSDKItem.fromJson(response);
                      ref.read(whiteLabelSDKNotifierProvider.notifier).add(newItem);
                      _showSnackBar('Item created successfully!');
                    }
                    Navigator.of(dialogContext).pop();
                  } catch (e) {
                    print('Error ${isEditing ? 'updating' : 'creating'} item: $e');
                    _showSnackBar('Failed to ${isEditing ? 'update' : 'create'} item.', isError: true);
                  }
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(WhiteLabelSDKItem item) async {
    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Delete Item', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete ${item.name}?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () async {
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.post('/trpc/whiteLabelSDK.delete', body: {'id': item.id});
                  ref.read(whiteLabelSDKNotifierProvider.notifier).remove(item.id);
                  _showSnackBar('Item deleted successfully!');
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  print('Error deleting item: $e');
                  _showSnackBar('Failed to delete item.', isError: true);
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
    final whiteLabelSDKListAsyncValue = ref.watch(whiteLabelSDKListProvider);
    final searchQuery = ref.watch(searchQueryProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'WhiteLabel SDK',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          PopupMenuButton<String>(
            onSelected: (String? newValue) {
              ref.read(filterStatusProvider.notifier).state = newValue;
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: null,
                child: Text('All'),
              ),
              const PopupMenuItem<String>(
                value: 'active',
                child: Text('Active'),
              ),
              const PopupMenuItem<String>(
                value: 'pending',
                child: Text('Pending'),
              ),
              const PopupMenuItem<String>(
                value: 'inactive',
                child: Text('Inactive'),
              ),
            ],
            child: Padding(
              padding: const EdgeInsets.all(8.0),
              child: Icon(Icons.filter_list, color: _textColor),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search by name...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: whiteLabelSDKListAsyncValue.when(
              data: (items) {
                final filteredItems = items.where((item) {
                  final matchesSearch = searchQuery.isEmpty ||
                      item.name.toLowerCase().contains(searchQuery.toLowerCase());
                  final matchesStatus = filterStatus == null ||
                      item.status.toLowerCase() == filterStatus.toLowerCase();
                  return matchesSearch && matchesStatus;
                }).toList();

                if (filteredItems.isEmpty) {
                  return Center(
                    child: Text(
                      'No WhiteLabel SDK items found.',
                      style: TextStyle(color: _textColor, fontSize: 18),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _refreshData,
                  color: _accentColor,
                  backgroundColor: _cardColor,
                  child: ListView.builder(
                    itemCount: filteredItems.length,
                    itemBuilder: (context, index) {
                      final item = filteredItems[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'ID: ${item.id}',
                                style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 12),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    item.name,
                                    style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(item.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      item.status,
                                      style: TextStyle(color: Colors.white, fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Amount: ${_formatAmount(item.amount)}',
                                style: TextStyle(color: _textColor, fontSize: 16),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Created At: ${_formatDate(item.createdAt)}',
                                style: TextStyle(color: _textColor.withOpacity(0.8), fontSize: 14),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: Icon(Icons.edit, color: _accentColor),
                                    onPressed: () => _showCreateEditDialog(item: item),
                                  ),
                                  IconButton(
                                    icon: Icon(Icons.delete, color: Colors.redAccent),
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
              loading: () => const Center(
                child: CircularProgressIndicator(color: _accentColor),
              ),
              error: (error, stack) => Center(
                child: Text(
                  'Error: ${error.toString()}',
                  style: TextStyle(color: Colors.red, fontSize: 18),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: _accentColor,
        child: Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
