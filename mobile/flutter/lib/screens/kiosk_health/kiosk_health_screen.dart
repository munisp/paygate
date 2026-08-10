import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data model for Kiosk Health
class KioskHealthItem {
  final String id;
  final String name;
  final String status; // e.g., 'Online', 'Offline', 'Maintenance'
  final DateTime lastReport;
  final double revenueToday;

  KioskHealthItem({
    required this.id,
    required this.name,
    required this.status,
    required this.lastReport,
    required this.revenueToday,
  });

  factory KioskHealthItem.fromJson(Map<String, dynamic> json) {
    return KioskHealthItem(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      lastReport: DateTime.parse(json['lastReport']),
      revenueToday: json['revenueToday'].toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'status': status,
      'lastReport': lastReport.toIso8601String(),
      'revenueToday': revenueToday,
    };
  }
}

// Riverpod provider for Kiosk Health data
final kioskHealthProvider = FutureProvider.family<List<KioskHealthItem>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/kioskHealth.list', params: {'query': query});
  // Simulate API delay
  await Future.delayed(const Duration(milliseconds: 500));
  // In a real app, you would parse the actual response from the API
  // For now, we'll return mock data filtered by query
  final allItems = [
    KioskHealthItem(id: '1', name: 'Kiosk A', status: 'Online', lastReport: DateTime.now().subtract(const Duration(minutes: 5)), revenueToday: 12500.50),
    KioskHealthItem(id: '2', name: 'Kiosk B', status: 'Offline', lastReport: DateTime.now().subtract(const Duration(hours: 2)), revenueToday: 8000.00),
    KioskHealthItem(id: '3', name: 'Kiosk C', status: 'Maintenance', lastReport: DateTime.now().subtract(const Duration(days: 1)), revenueToday: 500.75),
    KioskHealthItem(id: '4', name: 'Kiosk D', status: 'Online', lastReport: DateTime.now().subtract(const Duration(minutes: 30)), revenueToday: 20000.00),
  ];
  return allItems.where((item) => item.name.toLowerCase().contains(query.toLowerCase())).toList();
});

class KioskHealthScreen extends ConsumerStatefulWidget {
  const KioskHealthScreen({super.key});

  @override
  ConsumerState<KioskHealthScreen> createState() => _KioskHealthScreenState();
}

class _KioskHealthScreenState extends ConsumerState<KioskHealthScreen> {
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
    ref.invalidate(kioskHealthProvider(_searchQuery));
    await ref.read(kioskHealthProvider(_searchQuery).future);
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Online':
        return Colors.green;
      case 'Offline':
        return Colors.red;
      case 'Maintenance':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _formatCurrency(double amount) {
    final format = NumberFormat.currency(locale: 'en_NG', symbol: '₦', decimalDigits: 2);
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM d, yyyy HH:mm').format(date);
  }

  Future<void> _showCreateEditDialog({KioskHealthItem? item}) async {
    final isEditing = item != null;
    final TextEditingController nameController = TextEditingController(text: item?.name);
    final TextEditingController revenueController = TextEditingController(text: item?.revenueToday.toString());
    String? selectedStatus = item?.status;

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: Text(isEditing ? 'Edit Kiosk' : 'Create Kiosk', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Kiosk Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: revenueController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Revenue Today',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
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
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                items: <String>['Online', 'Offline', 'Maintenance'].map((String value) {
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
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isEmpty || revenueController.text.isEmpty || selectedStatus == null) {
                // Show error
                return;
              }
              final api = ref.read(apiServiceProvider);
              if (isEditing) {
                await api.post('/trpc/kioskHealth.update', body: {
                  'id': item!.id,
                  'name': nameController.text,
                  'status': selectedStatus,
                  'revenueToday': double.parse(revenueController.text),
                });
              } else {
                await api.post('/trpc/kioskHealth.create', body: {
                  'name': nameController.text,
                  'status': selectedStatus,
                  'revenueToday': double.parse(revenueController.text),
                  'lastReport': DateTime.now().toIso8601String(),
                });
              }
              ref.invalidate(kioskHealthProvider(_searchQuery));
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });
  }

  Future<void> _deleteKiosk(String id) async {
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Are you sure you want to delete this kiosk?', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      );
    });

    if (confirm == true) {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/kioskHealth.delete', body: {'id': id});
      ref.invalidate(kioskHealthProvider(_searchQuery));
    }
  }

  @override
  Widget build(BuildContext context) {
    final kioskHealthAsyncValue = ref.watch(kioskHealthProvider(_searchQuery));

    return Theme(
      data: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0f172a),
        cardColor: const Color(0xFF1e293b),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: Color(0xFFf1f5f9)),
          bodyMedium: TextStyle(color: Color(0xFFf1f5f9)),
          titleLarge: TextStyle(color: Color(0xFFf1f5f9)),
          titleMedium: TextStyle(color: Color(0xFFf1f5f9)),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1e293b),
          foregroundColor: Color(0xFFf1f5f9),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          hintStyle: TextStyle(color: Color(0xFF94a3b8)),
          labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
          enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
          focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xFF6366f1),
          foregroundColor: Color(0xFFf1f5f9),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Kiosk Health'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(kToolbarHeight),
            child: Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search kiosks...',
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: const Color(0xFF0f172a),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
          ),
        ),
        body: RefreshIndicator(
          onRefresh: _refreshData,
          child: kioskHealthAsyncValue.when(
            data: (items) {
              if (items.isEmpty) {
                return const Center(
                  child: Text(
                    'No kiosks found. Create one!',
                    style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                  ),
                );
              }
              return ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Card(
                    margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
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
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9)),
                              ),
                              Chip(
                                label: Text(item.status, style: const TextStyle(color: Color(0xFFf1f5f9))),
                                backgroundColor: _getStatusColor(item.status),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text('Last Report: ${_formatDate(item.lastReport)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                          const SizedBox(height: 4),
                          Text('Revenue Today: ${_formatCurrency(item.revenueToday)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showCreateEditDialog(item: item),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteKiosk(item.id),
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
            loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
            error: (err, stack) => Center(
              child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showCreateEditDialog(),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}