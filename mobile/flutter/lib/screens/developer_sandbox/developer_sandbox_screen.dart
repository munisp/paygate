import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Define theme colors
const Color _darkBackground = Color(0xFF0f172a);
const Color _darkCard = Color(0xFF1e293b);
const Color _darkText = Color(0xFFf1f5f9);
const Color _darkAccent = Color(0xFF6366f1);
const Color _statusSuccess = Colors.green;
const Color _statusPending = Colors.orange;
const Color _statusFailed = Colors.red;

// Data model for a sandbox item
class SandboxItem {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime createdAt;

  SandboxItem({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.createdAt,
  });

  factory SandboxItem.fromJson(Map<String, dynamic> json) {
    return SandboxItem(
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
}

// Provider for fetching sandbox items
final developerSandboxProvider = FutureProvider.autoDispose<List<SandboxItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/developer.listSandboxItems', params: {});
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List<dynamic>).map((e) => SandboxItem.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    // Handle error, e.g., log it or return an empty list
    print('Error fetching sandbox items: $e');
    return [];
  }
});

class DeveloperSandboxScreen extends ConsumerStatefulWidget {
  const DeveloperSandboxScreen({super.key});

  @override
  ConsumerState<DeveloperSandboxScreen> createState() => _DeveloperSandboxScreenState();
}

class _DeveloperSandboxScreenState extends ConsumerState<DeveloperSandboxScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;
  List<SandboxItem> _filteredItems = [];

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_filterItems);
  }

  @override
  void dispose() {
    _searchController.removeListener(_filterItems);
    _searchController.dispose();
    super.dispose();
  }

  void _filterItems() {
    final query = _searchController.text.toLowerCase();
    final allItems = ref.read(developerSandboxProvider).value ?? [];
    setState(() {
      _filteredItems = allItems.where((item) => item.name.toLowerCase().contains(query)).toList();
    });
  }

  Future<void> _createItem(String name) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/developer.createSandboxItem', body: {'name': name, 'status': 'pending', 'amount': 0.0, 'createdAt': DateTime.now().toIso8601String()});
      ref.invalidate(developerSandboxProvider);
    } catch (e) {
      print('Error creating item: $e');
      // Show error to user
    }
  }

  Future<void> _editItem(SandboxItem item, String newName) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/developer.updateSandboxItem', body: {'id': item.id, 'name': newName});
      ref.invalidate(developerSandboxProvider);
    } catch (e) {
      print('Error updating item: $e');
      // Show error to user
    }
  }

  Future<void> _deleteItem(String itemId) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.post('/trpc/developer.deleteSandboxItem', body: {'id': itemId});
      ref.invalidate(developerSandboxProvider);
    } catch (e) {
      print('Error deleting item: $e');
      // Show error to user
    }
  }

  void _showCreateDialog() {
    final TextEditingController createController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Create New Item', style: TextStyle(color: _darkText)),
        content: TextField(
          controller: createController,
          style: const TextStyle(color: _darkText),
          decoration: InputDecoration(
            hintText: 'Enter item name',
            hintStyle: TextStyle(color: _darkText.withOpacity(0.7)),
            enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
            focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              _createItem(createController.text);
              Navigator.pop(context);
            },
            child: const Text('Create', style: TextStyle(color: _darkAccent)),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(SandboxItem item) {
    final TextEditingController editController = TextEditingController(text: item.name);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Edit Item', style: TextStyle(color: _darkText)),
        content: TextField(
          controller: editController,
          style: const TextStyle(color: _darkText),
          decoration: InputDecoration(
            hintText: 'Edit item name',
            hintStyle: TextStyle(color: _darkText.withOpacity(0.7)),
            enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
            focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              _editItem(item, editController.text);
              Navigator.pop(context);
            },
            child: const Text('Save', style: TextStyle(color: _darkAccent)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(SandboxItem item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Delete Item', style: TextStyle(color: _darkText)),
        content: Text('Are you sure you want to delete "${item.name}"? This action cannot be undone.', style: const TextStyle(color: _darkText)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              _deleteItem(item.id);
              Navigator.pop(context);
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'success':
        return _statusSuccess;
      case 'pending':
        return _statusPending;
      case 'failed':
        return _statusFailed;
      default:
        return _darkText;
    }
  }

  String _formatCurrency(double amount) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: '₦'); // Naira symbol
    // You can add logic here to switch between Naira and USD based on a setting or data
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('yyyy-MM-dd HH:mm').format(date);
  }

  @override
  Widget build(BuildContext context) {
    final developerSandboxData = ref.watch(developerSandboxProvider);

    return Scaffold(
      backgroundColor: _darkBackground,
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                style: const TextStyle(color: _darkText),
                decoration: InputDecoration(
                  hintText: 'Search items...', 
                  hintStyle: TextStyle(color: _darkText.withOpacity(0.7)),
                  border: InputBorder.none,
                ),
                autofocus: true,
              )
            : const Text('Developer Sandbox', style: TextStyle(color: _darkText)),
        backgroundColor: _darkCard,
        iconTheme: const IconThemeData(color: _darkText),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search, color: _darkText),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchController.clear();
                  _filterItems(); // Reset filter when closing search
                }
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.add, color: _darkText),
            onPressed: _showCreateDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.refresh(developerSandboxProvider.future);
          _filterItems(); // Re-filter after refresh
        },
        child: developerSandboxData.when(
          data: (data) {
            if (_searchController.text.isEmpty) {
              _filteredItems = data; // Initialize filtered items with all data if search is empty
            }
            if (_filteredItems.isEmpty) {
              return const Center(
                child: Text(
                  'No developer sandbox items found.',
                  style: TextStyle(color: _darkText, fontSize: 16.0),
                ),
              );
            }
            return ListView.builder(
              itemCount: _filteredItems.length,
              itemBuilder: (context, index) {
                final item = _filteredItems[index];
                return Card(
                  color: _darkCard,
                  margin: const EdgeInsets.all(8.0),
                  child: ListTile(
                    title: Text(item.name, style: const TextStyle(color: _darkText)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Amount: ${_formatCurrency(item.amount)}', style: TextStyle(color: _darkText.withOpacity(0.8))),
                        Text('Created: ${_formatDate(item.createdAt)}', style: TextStyle(color: _darkText.withOpacity(0.8))),
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: _darkText)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getStatusColor(item.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                item.status.toUpperCase(),
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.edit, color: _darkAccent),
                          onPressed: () => _showEditDialog(item),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                          onPressed: () => _showDeleteConfirmationDialog(item),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: _darkAccent)),
          error: (error, stack) => Center(
            child: Text('Error: \n$error', style: const TextStyle(color: Colors.redAccent)),
          ),
        ),
      ),
    );
  }
}
