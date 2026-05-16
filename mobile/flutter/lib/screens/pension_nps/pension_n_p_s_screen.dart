import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a data model for PensionNPS items
class PensionNPSItem {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime dateCreated;

  PensionNPSItem({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.dateCreated,
  });

  factory PensionNPSItem.fromJson(Map<String, dynamic> json) {
    return PensionNPSItem(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      amount: (json['amount'] as num).toDouble(),
      dateCreated: DateTime.parse(json['dateCreated']),
    );
  }
}

// Provider for fetching PensionNPS items
final pensionNPSListProvider = FutureProvider.family<List<PensionNPSItem>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/pensionNPS.list', params: {'query': query});
  // Assuming response.data is a List<Map<String, dynamic>>
  return (response.data as List).map((item) => PensionNPSItem.fromJson(item)).toList();
});

// Provider for creating/updating PensionNPS items
final pensionNPSMutationProvider = Provider((ref) => PensionNPSMutation(ref));

class PensionNPSMutation {
  final Ref _ref;

  PensionNPSMutation(this._ref);

  Future<void> createItem(String name, double amount) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/pensionNPS.create', body: {'name': name, 'amount': amount});
  }

  Future<void> updateItem(String id, String name, double amount) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/pensionNPS.update', body: {'id': id, 'name': name, 'amount': amount});
  }

  Future<void> deleteItem(String id) async {
    final api = _ref.read(apiServiceProvider);
    await api.post('/trpc/pensionNPS.delete', body: {'id': id});
  }
}

class PensionNPSScreen extends ConsumerStatefulWidget {
  const PensionNPSScreen({super.key});

  @override
  ConsumerState<PensionNPSScreen> createState() => _PensionNPSScreenState();
}

class _PensionNPSScreenState extends ConsumerState<PensionNPSScreen> {
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

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
    ref.invalidate(pensionNPSListProvider(_searchQuery));
  }

  void _showCreateEditDialog({PensionNPSItem? item}) {
    final TextEditingController nameController = TextEditingController(text: item?.name);
    final TextEditingController amountController = TextEditingController(text: item?.amount.toString());

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: Text(item == null ? 'Create Pension/NPS Item' : 'Edit Pension/NPS Item', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Amount',
                labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              final name = nameController.text;
              final amount = double.tryParse(amountController.text) ?? 0.0;
              if (name.isNotEmpty && amount > 0) {
                final mutation = ref.read(pensionNPSMutationProvider);
                if (item == null) {
                  await mutation.createItem(name, amount);
                } else {
                  await mutation.updateItem(item.id, name, amount);
                }
                _refreshData();
                Navigator.of(context).pop();
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
            child: Text(item == null ? 'Create' : 'Save', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(PensionNPSItem item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b), // Card color
        title: const Text('Delete Confirmation', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete ${item.name}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () async {
              final mutation = ref.read(pensionNPSMutationProvider);
              await mutation.deleteItem(item.id);
              _refreshData();
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pensionNPSListAsyncValue = ref.watch(pensionNPSListProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Background color
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b), // Card color for AppBar
        title: const Text('Pension/NPS Management', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateEditDialog(),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search Pension/NPS items...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Background color for search field
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: pensionNPSListAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.red))),
          data: (items) {
            if (items.isEmpty) {
              return const Center(
                child: Text(
                  'No Pension/NPS items found.',
                  style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18),
                ),
              );
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card color
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  child: ListTile(
                    title: Text(item.name, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Amount: ₦${item.amount.toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                        Text.rich(
                          TextSpan(
                            text: 'Status: ',
                            style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
                            children: [
                              TextSpan(
                                text: item.status,
                                style: TextStyle(
                                  color: item.status == 'Active' ? Colors.green : (item.status == 'Pending' ? Colors.orange : Colors.red),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text('Created: ${item.dateCreated.toLocal().toIso8601String().split('T')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                      ],
                    ),
                    trailing: PopupMenuButton<String>(
                      icon: const Icon(Icons.more_vert, color: Color(0xFFf1f5f9)),
                      onSelected: (value) {
                        if (value == 'edit') {
                          _showCreateEditDialog(item: item);
                        } else if (value == 'delete') {
                          _showDeleteConfirmationDialog(item);
                        }
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem(
                          value: 'edit',
                          child: Text('Edit', style: TextStyle(color: Color(0xFFf1f5f9))),
                        ),
                        const PopupMenuItem(
                          value: 'delete',
                          child: Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
                        ),
                      ],
                      color: const Color(0xFF1e293b), // Card color for popup menu
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
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
