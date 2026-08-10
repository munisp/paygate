import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder data model for a loyalty item
class LoyaltyItem {
  final String id;
  final String name;
  final String description;
  final double points;
  final DateTime createdAt;
  final String status;

  LoyaltyItem({
    required this.id,
    required this.name,
    required this.description,
    required this.points,
    required this.createdAt,
    required this.status,
  });

  factory LoyaltyItem.fromJson(Map<String, dynamic> json) {
    return LoyaltyItem(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      points: (json['points'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      status: json['status'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'points': points,
        'createdAt': createdAt.toIso8601String(),
        'status': status,
      };

  LoyaltyItem copyWith({
    String? id,
    String? name,
    String? description,
    double? points,
    DateTime? createdAt,
    String? status,
  }) {
    return LoyaltyItem(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      points: points ?? this.points,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
    );
  }
}

// Riverpod provider for fetching loyalty items
final loyaltyItemsProvider = FutureProvider.family<List<LoyaltyItem>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get(
      '/trpc/consumerLoyalty.list',
      params: {'search': searchTerm},
    );
    // Assuming response.data is a List<Map<String, dynamic>>
    return (response.data as List)
        .map((itemJson) => LoyaltyItem.fromJson(itemJson as Map<String, dynamic>))
        .toList();
  } catch (e) {
    // Handle API errors, e.g., log them or show a user-friendly message
    print('Error fetching loyalty items: $e');
    rethrow;
  }
});

// Mutation providers
final createLoyaltyItemProvider = FutureProvider.family<LoyaltyItem, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/consumerLoyalty.create', body: data);
  return LoyaltyItem.fromJson(response.data as Map<String, dynamic>);
});

final updateLoyaltyItemProvider = FutureProvider.family<LoyaltyItem, Map<String, dynamic>>((ref, data) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.post('/trpc/consumerLoyalty.update', body: data);
  return LoyaltyItem.fromJson(response.data as Map<String, dynamic>);
});

final deleteLoyaltyItemProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/consumerLoyalty.delete', body: {'id': id});
});

class ConsumerLoyaltyAppScreen extends ConsumerStatefulWidget {
  const ConsumerLoyaltyAppScreen({super.key});

  @override
  ConsumerState<ConsumerLoyaltyAppScreen> createState() => _ConsumerLoyaltyAppScreenState();
}

class _ConsumerLoyaltyAppScreenState extends ConsumerState<ConsumerLoyaltyAppScreen> {
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();
  String _searchTerm = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchTerm = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : _accentColor,
      ),
    );
  }

  Future<void> _showCreateLoyaltyItemDialog() async {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController descriptionController = TextEditingController();
    final TextEditingController pointsController = TextEditingController();

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create Loyalty Item', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: descriptionController,
                  decoration: InputDecoration(
                    labelText: 'Description',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: pointsController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Points',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                try {
                  final newLoyaltyItem = {
                    'name': nameController.text,
                    'description': descriptionController.text,
                    'points': double.parse(pointsController.text),
                    'status': 'active', // Default status
                  };
                  await ref.read(createLoyaltyItemProvider(newLoyaltyItem).future);
                  ref.invalidate(loyaltyItemsProvider(_searchTerm));
                  _showSnackBar('Loyalty item created successfully!');
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  _showSnackBar('Failed to create loyalty item: $e', isError: true);
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEditLoyaltyItemDialog(LoyaltyItem item) async {
    final TextEditingController nameController = TextEditingController(text: item.name);
    final TextEditingController descriptionController = TextEditingController(text: item.description);
    final TextEditingController pointsController = TextEditingController(text: item.points.toString());

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit Loyalty Item', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: descriptionController,
                  decoration: InputDecoration(
                    labelText: 'Description',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: pointsController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Points',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                try {
                  final updatedLoyaltyItem = item.copyWith(
                    name: nameController.text,
                    description: descriptionController.text,
                    points: double.parse(pointsController.text),
                  );
                  await ref.read(updateLoyaltyItemProvider(updatedLoyaltyItem.toJson()).future);
                  ref.invalidate(loyaltyItemsProvider(_searchTerm));
                  _showSnackBar('Loyalty item updated successfully!');
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  _showSnackBar('Failed to update loyalty item: $e', isError: true);
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteLoyaltyItemDialog(LoyaltyItem item) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Delete Loyalty Item', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to delete ${item.name}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                try {
                  await ref.read(deleteLoyaltyItemProvider(item.id).future);
                  ref.invalidate(loyaltyItemsProvider(_searchTerm));
                  _showSnackBar('Loyalty item deleted successfully!');
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  _showSnackBar('Failed to delete loyalty item: $e', isError: true);
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
    String statusText;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        statusText = 'Active';
        break;
      case 'inactive':
        badgeColor = Colors.orange;
        statusText = 'Inactive';
        break;
      default:
        badgeColor = Colors.grey;
        statusText = 'Unknown';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        statusText,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  String _formatCurrency(double amount) {
    // Assuming Naira ₦ as default, can be made dynamic
    return '₦${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final loyaltyItemsAsyncValue = ref.watch(loyaltyItemsProvider(_searchTerm));

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Consumer Loyalty App',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search loyalty items...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
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
        onRefresh: () async {
          ref.invalidate(loyaltyItemsProvider(_searchTerm));
          await ref.read(loyaltyItemsProvider(_searchTerm).future);
        },
        child: loyaltyItemsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (items) {
            if (items.isEmpty) {
              return Center(
                child: Text(
                  'No loyalty items found.',
                  style: TextStyle(color: _textColor.withOpacity(0.7)),
                ),
              );
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  child: ListTile(
                    title: Text(item.name, style: const TextStyle(color: _textColor)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.description, style: TextStyle(color: _textColor.withOpacity(0.8))),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _buildStatusBadge(item.status),
                            const SizedBox(width: 8),
                            Text('Created: ${_formatDate(item.createdAt)}', style: TextStyle(color: _textColor.withOpacity(0.6), fontSize: 12)),
                          ],
                        ),
                      ],
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${item.points.toStringAsFixed(0)} points',
                          style: const TextStyle(color: _accentColor, fontWeight: FontWeight.bold),
                        ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _textColor),
                              onPressed: () => _showEditLoyaltyItemDialog(item),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteLoyaltyItemDialog(item),
                            ),
                          ],
                        ),
                      ],
                    ),
                    onTap: () {
                      // Optionally, navigate to a detail screen or show more info
                    },
                  ),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateLoyaltyItemDialog,
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
