import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Mock data model for a Mobile POS item
class MobilePOSItem {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final String status;
  final DateTime createdAt;

  MobilePOSItem({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory MobilePOSItem.fromJson(Map<String, dynamic> json) {
    return MobilePOSItem(
      id: json['id'],
      name: json['name'],
      amount: json['amount'].toDouble(),
      currency: json['currency'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'amount': amount,
        'currency': currency,
        'status': status,
        'createdAt': createdAt.toIso8601String(),
      };
}

// Provider for Mobile POS items
final mobilePOSItemsProvider = FutureProvider.family<List<MobilePOSItem>, String>((ref, query) async {
  // Simulate API call
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/mobilePos.list', params: {'query': query});
  // In a real app, you'd parse the response into a list of MobilePOSItem
  // For now, return mock data filtered by query
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  final allItems = [
    MobilePOSItem(id: '1', name: 'POS Terminal A', amount: 150000.00, currency: '₦', status: 'Active', createdAt: DateTime(2023, 1, 15)),
    MobilePOSItem(id: '2', name: 'POS Terminal B', amount: 1200.50, currency: '$', status: 'Inactive', createdAt: DateTime(2023, 2, 20)),
    MobilePOSItem(id: '3', name: 'POS Terminal C', amount: 200000.00, currency: '₦', status: 'Active', createdAt: DateTime(2023, 3, 10)),
    MobilePOSItem(id: '4', name: 'POS Terminal D', amount: 800.00, currency: '$', status: 'Maintenance', createdAt: DateTime(2023, 4, 5)),
  ];
  if (query.isEmpty) {
    return allItems;
  } else {
    return allItems.where((item) => item.name.toLowerCase().contains(query.toLowerCase())).toList();
  }
});

class MobilePOSScreen extends ConsumerStatefulWidget {
  const MobilePOSScreen({super.key});

  @override
  ConsumerState<MobilePOSScreen> createState() => _MobilePOSScreenState();
}

class _MobilePOSScreenState extends ConsumerState<MobilePOSScreen> {
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

  Future<void> _refreshItems() async {
    ref.invalidate(mobilePOSItemsProvider(_searchQuery));
    await ref.read(mobilePOSItemsProvider(_searchQuery).future);
  }

  // CRUD Operations (simulated)
  Future<void> _createItem(MobilePOSItem newItem) async {
    // Simulate API call
    final api = ref.read(apiServiceProvider);
    await api.post('/trpc/mobilePos.create', body: newItem.toJson());
    ref.invalidate(mobilePOSItemsProvider(_searchQuery));
  }

  Future<void> _updateItem(MobilePOSItem updatedItem) async {
    // Simulate API call
    final api = ref.read(apiServiceProvider);
    await api.post('/trpc/mobilePos.update', body: updatedItem.toJson());
    ref.invalidate(mobilePOSItemsProvider(_searchQuery));
  }

  Future<void> _deleteItem(String id) async {
    // Simulate API call
    final api = ref.read(apiServiceProvider);
    await api.post('/trpc/mobilePos.delete', body: {'id': id});
    ref.invalidate(mobilePOSItemsProvider(_searchQuery));
  }

  @override
  Widget build(BuildContext context) {
    final mobilePOSItemsAsyncValue = ref.watch(mobilePOSItemsProvider(_searchQuery));

    // Theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('Mobile POS', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: accentColor),
            onPressed: () => _showCreateEditDialog(context),
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
                hintText: 'Search POS terminals...',
                hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: textColor.withOpacity(0.7)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: cardColor,
              ),
              style: const TextStyle(color: textColor),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshItems,
              color: accentColor,
              backgroundColor: cardColor,
              child: mobilePOSItemsAsyncValue.when(
                data: (items) {
                  if (items.isEmpty) {
                    return Center(
                      child: Text(
                        'No POS terminals found.',
                        style: TextStyle(color: textColor.withOpacity(0.7), fontSize: 16),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(item.name, style: const TextStyle(color: textColor, fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${item.currency} ${NumberFormat('#,##0.00').format(item.amount)}',
                                style: TextStyle(color: textColor.withOpacity(0.9)),
                              ),
                              Text(
                                'Created: ${DateFormat('yyyy-MM-dd').format(item.createdAt)}',
                                style: TextStyle(color: textColor.withOpacity(0.7)),
                              ),
                              _buildStatusBadge(item.status),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: accentColor),
                                onPressed: () => _showCreateEditDialog(context, item: item),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _confirmDelete(context, item.id, item.name),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor;
    switch (status) {
      case 'Active':
        badgeColor = Colors.green.shade700;
        textColor = Colors.white;
        break;
      case 'Inactive':
        badgeColor = Colors.red.shade700;
        textColor = Colors.white;
        break;
      case 'Maintenance':
        badgeColor = Colors.orange.shade700;
        textColor = Colors.white;
        break;
      default:
        badgeColor = Colors.grey.shade700;
        textColor = Colors.white;
    }
    return Chip(
      label: Text(status, style: TextStyle(color: textColor, fontSize: 12)),
      backgroundColor: badgeColor,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }

  Future<void> _showCreateEditDialog(BuildContext context, {MobilePOSItem? item}) async {
    final isEditing = item != null;
    final TextEditingController nameController = TextEditingController(text: item?.name);
    final TextEditingController amountController = TextEditingController(text: item?.amount.toString());
    String? selectedCurrency = item?.currency ?? '₦';
    String? selectedStatus = item?.status ?? 'Active';

    await showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1e293b), // cardColor
              title: Text(isEditing ? 'Edit POS Terminal' : 'Create POS Terminal', style: const TextStyle(color: Color(0xFFf1f5f9))), // textColor
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      decoration: InputDecoration(
                        labelText: 'Terminal Name',
                        labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                        enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                        focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amountController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Amount',
                        labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                        enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                        focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                      ),
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: selectedCurrency,
                      dropdownColor: const Color(0xFF1e293b), // cardColor
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                      decoration: InputDecoration(
                        labelText: 'Currency',
                        labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                        enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                        focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                      ),
                      items: <String>['₦', '$'].map<DropdownMenuItem<String>>((String value) {
                        return DropdownMenuItem<String>(
                          value: value,
                          child: Text(value),
                        );
                      }).toList(),
                      onChanged: (String? newValue) {
                        setState(() {
                          selectedCurrency = newValue;
                        });
                      },
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: selectedStatus,
                      dropdownColor: const Color(0xFF1e293b), // cardColor
                      style: const TextStyle(color: Color(0xFFf1f5f9)),
                      decoration: InputDecoration(
                        labelText: 'Status',
                        labelStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                        enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                        focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))), // accentColor
                      ),
                      items: <String>['Active', 'Inactive', 'Maintenance'].map<DropdownMenuItem<String>>((String value) {
                        return DropdownMenuItem<String>(
                          value: value,
                          child: Text(value),
                        );
                      }).toList(),
                      onChanged: (String? newValue) {
                        setState(() {
                          selectedStatus = newValue;
                        });
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // textColor
                ),
                TextButton(
                  onPressed: () {
                    if (nameController.text.isNotEmpty && amountController.text.isNotEmpty && selectedCurrency != null && selectedStatus != null) {
                      final newItem = MobilePOSItem(
                        id: isEditing ? item!.id : DateTime.now().millisecondsSinceEpoch.toString(),
                        name: nameController.text,
                        amount: double.parse(amountController.text),
                        currency: selectedCurrency!,
                        status: selectedStatus!,
                        createdAt: isEditing ? item!.createdAt : DateTime.now(),
                      );
                      if (isEditing) {
                        _updateItem(newItem);
                      } else {
                        _createItem(newItem);
                      }
                      Navigator.of(context).pop();
                    }
                  },
                  child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFF6366f1))), // accentColor
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _confirmDelete(BuildContext context, String id, String name) async {
    await showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // cardColor
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))), // textColor
          content: Text('Are you sure you want to delete POS Terminal \'$name\'', style: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.9))), // textColor
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // textColor
            ),
            TextButton(
              onPressed: () {
                _deleteItem(id);
                Navigator.of(context).pop();
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}