import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Data model for a Portfolio Rebalancing item
class PortfolioRebalancingItem {
  final String id;
  final String name;
  final double currentWeight;
  final double targetWeight;
  final String status; // e.g., 'Rebalanced', 'Pending', 'Overweight', 'Underweight'
  final DateTime lastRebalanced;
  final double amountToAdjust;

  PortfolioRebalancingItem({
    required this.id,
    required this.name,
    required this.currentWeight,
    required this.targetWeight,
    required this.status,
    required this.lastRebalanced,
    required this.amountToAdjust,
  });

  factory PortfolioRebalancingItem.fromJson(Map<String, dynamic> json) {
    return PortfolioRebalancingItem(
      id: json['id'],
      name: json['name'],
      currentWeight: (json['currentWeight'] as num).toDouble(),
      targetWeight: (json['targetWeight'] as num).toDouble(),
      status: json['status'],
      lastRebalanced: DateTime.parse(json['lastRebalanced']),
      amountToAdjust: (json['amountToAdjust'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'currentWeight': currentWeight,
        'targetWeight': targetWeight,
        'status': status,
        'lastRebalanced': lastRebalanced.toIso8601String(),
        'amountToAdjust': amountToAdjust,
      };

  PortfolioRebalancingItem copyWith({
    String? id,
    String? name,
    double? currentWeight,
    double? targetWeight,
    String? status,
    DateTime? lastRebalanced,
    double? amountToAdjust,
  }) {
    return PortfolioRebalancingItem(
      id: id ?? this.id,
      name: name ?? this.name,
      currentWeight: currentWeight ?? this.currentWeight,
      targetWeight: targetWeight ?? this.targetWeight,
      status: status ?? this.status,
      lastRebalanced: lastRebalanced ?? this.lastRebalanced,
      amountToAdjust: amountToAdjust ?? this.amountToAdjust,
    );
  }
}

// Riverpod provider for fetching portfolio rebalancing items
final portfolioRebalancingProvider = FutureProvider.family<
    List<PortfolioRebalancingItem>,
    String?>((ref, searchQuery) async {
  final apiService = ref.read(apiServiceProvider);
  // Simulate API call
  final response = await apiService.get(
    '/trpc/portfolioRebalancing.list',
    params: searchQuery != null && searchQuery.isNotEmpty
        ? {'search': searchQuery}
        : null,
  );

  // Simulate data filtering based on search query
  List<PortfolioRebalancingItem> allItems = (
    response['items'] as List
  ).map((json) => PortfolioRebalancingItem.fromJson(json)).toList();

  if (searchQuery != null && searchQuery.isNotEmpty) {
    allItems = allItems
        .where((item) =>
            item.name.toLowerCase().contains(searchQuery.toLowerCase()))
        .toList();
  }
  return allItems;
});

// Riverpod provider for managing the search query
final portfolioRebalancingSearchQueryProvider = StateProvider<String?>((ref) => null);

// Riverpod provider for managing selected item for CRUD operations
final selectedPortfolioRebalancingItemProvider = StateProvider<PortfolioRebalancingItem?>((ref) => null);

class PortfolioRebalancingScreen extends ConsumerStatefulWidget {
  const PortfolioRebalancingScreen({super.key});

  @override
  ConsumerState<PortfolioRebalancingScreen> createState() =>
      _PortfolioRebalancingScreenState();
}

class _PortfolioRebalancingScreenState
    extends ConsumerState<PortfolioRebalancingScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Helper for amount formatting
  String _formatAmount(double amount, {String currency = '₦'}) {
    return '$currency${amount.toStringAsFixed(2)}';
  }

  // Helper for date formatting (basic, without intl package)
  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  // Helper for status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'rebalanced':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'overweight':
        return Colors.red;
      case 'underweight':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  // CRUD: Create/Edit Dialog
  Future<void> _showCreateEditDialog(
      BuildContext context, PortfolioRebalancingItem? item) async {
    final isEditing = item != null;
    final nameController = TextEditingController(text: item?.name);
    final currentWeightController = TextEditingController(
        text: item?.currentWeight.toStringAsFixed(2));
    final targetWeightController = TextEditingController(
        text: item?.targetWeight.toStringAsFixed(2));
    final amountToAdjustController = TextEditingController(
        text: item?.amountToAdjust.toStringAsFixed(2));
    String? selectedStatus = item?.status;

    await showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit Item' : 'Create New Item',
              style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: currentWeightController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Current Weight',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: targetWeightController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Target Weight',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: amountToAdjustController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount to Adjust',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  items: <String>[
                    'Rebalanced',
                    'Pending',
                    'Overweight',
                    'Underweight'
                  ].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel',
                  style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                if (nameController.text.isEmpty ||
                    currentWeightController.text.isEmpty ||
                    targetWeightController.text.isEmpty ||
                    amountToAdjustController.text.isEmpty ||
                    selectedStatus == null) {
                  // Basic validation
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Please fill all fields')),
                  );
                  return;
                }

                final newItem = PortfolioRebalancingItem(
                  id: isEditing ? item!.id : UniqueKey().toString(),
                  name: nameController.text,
                  currentWeight: double.parse(currentWeightController.text),
                  targetWeight: double.parse(targetWeightController.text),
                  status: selectedStatus!,
                  lastRebalanced: item?.lastRebalanced ?? DateTime.now(),
                  amountToAdjust: double.parse(amountToAdjustController.text),
                );

                final apiService = ref.read(apiServiceProvider);
                if (isEditing) {
                  // Simulate update API call
                  await apiService.post(
                    '/trpc/portfolioRebalancing.update',
                    body: newItem.toJson(),
                  );
                } else {
                  // Simulate create API call
                  await apiService.post(
                    '/trpc/portfolioRebalancing.create',
                    body: newItem.toJson(),
                  );
                }
                ref.invalidate(portfolioRebalancingProvider);
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6366f1)),
              child: Text(isEditing ? 'Save' : 'Create',
                  style: const TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  // CRUD: Delete Confirmation Dialog
  Future<void> _showDeleteConfirmationDialog(
      BuildContext context, PortfolioRebalancingItem item) async {
    await showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete',
              style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${item.name}?',
              style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel',
                  style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: () async {
                final apiService = ref.read(apiServiceProvider);
                // Simulate delete API call
                await apiService.post(
                  '/trpc/portfolioRebalancing.delete',
                  body: {'id': item.id},
                );
                ref.invalidate(portfolioRebalancingProvider);
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Delete',
                  style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(portfolioRebalancingSearchQueryProvider);
    final asyncItems = ref.watch(portfolioRebalancingProvider(searchQuery));

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
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xFF6366f1),
          foregroundColor: Color(0xFFf1f5f9),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          hintStyle: TextStyle(color: Color(0xFF94a3b8)),
          prefixIconColor: Color(0xFF94a3b8),
          suffixIconColor: Color(0xFF94a3b8),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Portfolio Rebalancing'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(kToolbarHeight),
            child: Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search by name...', 
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            ref
                                .read(
                                    portfolioRebalancingSearchQueryProvider.notifier)
                                .state = null;
                          },
                        )
                      : null,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF0f172a),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                onChanged: (value) {
                  ref
                      .read(portfolioRebalancingSearchQueryProvider.notifier)
                      .state = value.isEmpty ? null : value;
                },
              ),
            ),
          ),
        ),
        body: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(portfolioRebalancingProvider);
          },
          child: asyncItems.when(
            data: (items) {
              if (items.isEmpty) {
                return const Center(
                  child: Text(
                    'No portfolio rebalancing items found.',
                    style: TextStyle(color: Color(0xFFf1f5f9)),
                  ),
                );
              }
              return ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Card(
                    margin: const EdgeInsets.all(8.0),
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
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFFf1f5f9),
                                ),
                              ),
                              Chip(
                                label: Text(item.status),
                                backgroundColor: _getStatusColor(item.status),
                                labelStyle: const TextStyle(color: Colors.white),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text('Current Weight: ${item.currentWeight.toStringAsFixed(2)}%',
                              style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Text('Target Weight: ${item.targetWeight.toStringAsFixed(2)}%',
                              style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Text('Amount to Adjust: ${_formatAmount(item.amountToAdjust)}',
                              style: const TextStyle(color: Color(0xFFf1f5f9))),
                          Text('Last Rebalanced: ${_formatDate(item.lastRebalanced)}',
                              style: const TextStyle(color: Color(0xFFf1f5f9))),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit,
                                    color: Color(0xFF6366f1)),
                                onPressed: () =>
                                    _showCreateEditDialog(context, item),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete,
                                    color: Colors.redAccent),
                                onPressed: () =>
                                    _showDeleteConfirmationDialog(context, item),
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
            loading: () => const Center(
                child: CircularProgressIndicator(color: Color(0xFF6366f1))),
            error: (err, stack) => Center(
              child: Text('Error: $err',
                  style: const TextStyle(color: Colors.redAccent)),
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showCreateEditDialog(context, null),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}
