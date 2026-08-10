import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Dummy Model for CrossBorderRail data
class CrossBorderRail {
  final String id;
  final String railName;
  final String status;
  final double volume;
  final DateTime lastUpdated;

  CrossBorderRail({
    required this.id,
    required this.railName,
    required this.status,
    required this.volume,
    required this.lastUpdated,
  });

  factory CrossBorderRail.fromJson(Map<String, dynamic> json) {
    return CrossBorderRail(
      id: json['id'] as String,
      railName: json['railName'] as String,
      status: json['status'] as String,
      volume: (json['volume'] as num).toDouble(),
      lastUpdated: DateTime.parse(json['lastUpdated'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'railName': railName,
        'status': status,
        'volume': volume,
        'lastUpdated': lastUpdated.toIso8601String(),
      };
}

// Riverpod provider for fetching CrossBorderRail data
final crossBorderRailMonitorProvider = FutureProvider.autoDispose<List<CrossBorderRail>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  // final response = await api.get('/trpc/crossBorderRail.list', params: {});
  // return (response.data as List).map((e) => CrossBorderRail.fromJson(e)).toList();

  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1));
  return [
    CrossBorderRail(id: '1', railName: 'Rail A - Lagos-Accra', status: 'Active', volume: 125000.00, lastUpdated: DateTime.now().subtract(const Duration(days: 1))),
    CrossBorderRail(id: '2', railName: 'Rail B - Nairobi-Kampala', status: 'Inactive', volume: 75000.50, lastUpdated: DateTime.now().subtract(const Duration(hours: 5))),
    CrossBorderRail(id: '3', railName: 'Rail C - Cairo-Khartoum', status: 'Maintenance', volume: 20000.00, lastUpdated: DateTime.now().subtract(const Duration(days: 3))),
    CrossBorderRail(id: '4', railName: 'Rail D - Johannesburg-Gaborone', status: 'Active', volume: 300000.75, lastUpdated: DateTime.now().subtract(const Duration(minutes: 30))),
  ];
});

// Provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Provider for filtered rails
final filteredCrossBorderRailsProvider = Provider.autoDispose<List<CrossBorderRail>>((ref) {
  final rails = ref.watch(crossBorderRailMonitorProvider).valueOrNull ?? [];
  final searchQuery = ref.watch(searchQueryProvider).toLowerCase();

  if (searchQuery.isEmpty) {
    return rails;
  } else {
    return rails.where((rail) {
      return rail.railName.toLowerCase().contains(searchQuery) ||
             rail.status.toLowerCase().contains(searchQuery);
    }).toList();
  }
});

class CrossBorderRailMonitorScreen extends ConsumerStatefulWidget {
  const CrossBorderRailMonitorScreen({super.key});

  @override
  ConsumerState<CrossBorderRailMonitorScreen> createState() => _CrossBorderRailMonitorScreenState();
}

class _CrossBorderRailMonitorScreenState extends ConsumerState<CrossBorderRailMonitorScreen> {
  final TextEditingController _searchController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.red;
      case 'maintenance':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _formatCurrency(double amount) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: '₦'); // Default to Naira
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM d, yyyy HH:mm').format(date);
  }

  Future<void> _showCreateEditDialog({CrossBorderRail? rail}) async {
    final isEditing = rail != null;
    final railNameController = TextEditingController(text: rail?.railName);
    final statusController = TextEditingController(text: rail?.status);
    final volumeController = TextEditingController(text: rail?.volume.toString());

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: Text(isEditing ? 'Edit Rail' : 'Create New Rail', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: railNameController,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  labelText: 'Rail Name',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                validator: (value) => value!.isEmpty ? 'Rail Name cannot be empty' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: statusController,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                validator: (value) => value!.isEmpty ? 'Status cannot be empty' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: volumeController,
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Volume',
                  labelStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                  enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                ),
                validator: (value) => value!.isEmpty || double.tryParse(value) == null ? 'Enter a valid number' : null,
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
              if (_formKey.currentState!.validate()) {
                final api = ref.read(apiServiceProvider);
                try {
                  if (isEditing) {
                    // Simulate API call for update
                    await api.post(
                      '/trpc/crossBorderRail.update',
                      body: {
                        'id': rail!.id,
                        'railName': railNameController.text,
                        'status': statusController.text,
                        'volume': double.parse(volumeController.text),
                      },
                    );
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Rail updated successfully!'))
                      );
                    }
                  } else {
                    // Simulate API call for create
                    await api.post(
                      '/trpc/crossBorderRail.create',
                      body: {
                        'railName': railNameController.text,
                        'status': statusController.text,
                        'volume': double.parse(volumeController.text),
                      },
                    );
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Rail created successfully!'))
                      );
                    }
                  }
                  ref.invalidate(crossBorderRailMonitorProvider);
                  if (mounted) {
                    Navigator.of(context).pop();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to save rail: $e'))
                    );
                  }
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  Future<void> _showDeleteConfirmationDialog(CrossBorderRail rail) async {
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Delete Rail', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete ${rail.railName}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
          ElevatedButton(
            onPressed: () async {
              final api = ref.read(apiServiceProvider);
              try {
                // Simulate API call for delete
                await api.post('/trpc/crossBorderRail.delete', body: {'id': rail.id});
                ref.invalidate(crossBorderRailMonitorProvider);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Rail deleted successfully!'))
                  );
                  Navigator.of(context).pop();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete rail: $e'))
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredRailsAsyncValue = ref.watch(filteredCrossBorderRailsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'Cross-Border Rail Monitor',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight + 16), // Increased height for search bar
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              onChanged: (query) => ref.read(searchQueryProvider.notifier).state = query,
              style: const TextStyle(color: Color(0xFFf1f5f9)),
              decoration: InputDecoration(
                hintText: 'Search rails...', 
                hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF0f172a),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(crossBorderRailMonitorProvider.future),
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: filteredRailsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(
            child: Text(
              'Error: $err',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          data: (rails) {
            if (rails.isEmpty) {
              return const Center(
                child: Text(
                  'No matching cross-border rail data available.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: rails.length,
              itemBuilder: (context, index) {
                final rail = rails[index];
                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rail.railName,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: _getStatusColor(rail.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                rail.status,
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Text(
                              'Volume: ${_formatCurrency(rail.volume)}',
                              style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8), fontSize: 14),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Last Updated: ${_formatDate(rail.lastUpdated)}',
                          style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6), fontSize: 12),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () => _showCreateEditDialog(rail: rail),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _showDeleteConfirmationDialog(rail),
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
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
