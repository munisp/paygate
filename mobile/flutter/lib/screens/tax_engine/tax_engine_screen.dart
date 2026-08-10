
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Assuming a data model for TaxEngine entries
class TaxEngineEntry {
  final String id;
  final String name;
  final String status;
  final double rate;
  final DateTime createdAt;

  TaxEngineEntry({
    required this.id,
    required this.name,
    required this.status,
    required this.rate,
    required this.createdAt,
  });

  factory TaxEngineEntry.fromJson(Map<String, dynamic> json) {
    return TaxEngineEntry(
      id: json['id'],
      name: json['name'],
      status: json['status'],
      rate: (json['rate'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

// State for TaxEngine data
class TaxEngineState {
  final List<TaxEngineEntry> entries;
  final bool isLoading;
  final String? error;

  TaxEngineState({
    this.entries = const [],
    this.isLoading = false,
    this.error,
  });

  TaxEngineState copyWith({
    List<TaxEngineEntry>? entries,
    bool? isLoading,
    String? error,
  }) {
    return TaxEngineState(
      entries: entries ?? this.entries,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

// Riverpod provider for TaxEngine data
final taxEngineProvider = StateNotifierProvider<TaxEngineNotifier, TaxEngineState>((ref) {
  return TaxEngineNotifier(ref.read(apiServiceProvider));
});

class TaxEngineNotifier extends StateNotifier<TaxEngineState> {
  final ApiService _apiService;

  TaxEngineNotifier(this._apiService) : super(TaxEngineState()) {
    fetchEntries();
  }

  Future<void> fetchEntries() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _apiService.get('/trpc/taxEngine.list');
      final List<TaxEngineEntry> entries = (response['entries'] as List)
          .map((e) => TaxEngineEntry.fromJson(e))
          .toList();
      state = state.copyWith(entries: entries, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> createEntry(String name, double rate) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiService.post('/trpc/taxEngine.create', body: {'name': name, 'rate': rate});
      await fetchEntries(); // Refresh list after creation
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> updateEntry(String id, String name, double rate) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiService.post('/trpc/taxEngine.update', body: {'id': id, 'name': name, 'rate': rate});
      await fetchEntries(); // Refresh list after update
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> deleteEntry(String id) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiService.post('/trpc/taxEngine.delete', body: {'id': id});
      await fetchEntries(); // Refresh list after deletion
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

class TaxEngineScreen extends ConsumerStatefulWidget {
  const TaxEngineScreen({super.key});

  @override
  ConsumerState<TaxEngineScreen> createState() => _TaxEngineScreenState();
}

class _TaxEngineScreenState extends ConsumerState<TaxEngineScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      // Implement search/filter logic here if needed, or refetch with params
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Helper for currency formatting
  String _formatAmount(double amount) {
    // Assuming Naira for now, can be made dynamic
    return '₦${amount.toStringAsFixed(2)}';
  }

  // Helper for date formatting
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // Status badge widget
  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        break;
      case 'inactive':
        color = Colors.red;
        break;
      case 'pending':
        color = Colors.orange;
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
      child: Text(
        status,
        style: TextStyle(color: color, fontSize: 12),
      ),
    );
  }

  Future<void> _showCreateEditDialog({TaxEngineEntry? entry}) async {
    final TextEditingController nameController = TextEditingController(text: entry?.name);
    final TextEditingController rateController = TextEditingController(text: entry?.rate.toString());

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card color
          title: Text(entry == null ? 'Create Tax Entry' : 'Edit Tax Entry', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFf1f5f9)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: rateController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Rate',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFf1f5f9)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9)))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: Text(entry == null ? 'Create' : 'Save', style: const TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final name = nameController.text;
                final rate = double.tryParse(rateController.text);
                if (name.isNotEmpty && rate != null) {
                  if (entry == null) {
                    await ref.read(taxEngineProvider.notifier).createEntry(name, rate);
                  } else {
                    await ref.read(taxEngineProvider.notifier).updateEntry(entry.id, name, rate);
                  }
                  Navigator.of(context).pop();
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(TaxEngineEntry entry) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card color
          title: const Text('Delete Tax Entry', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete ${entry.name}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () async {
                await ref.read(taxEngineProvider.notifier).deleteEntry(entry.id);
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final taxEngineState = ref.watch(taxEngineProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Background color
      appBar: AppBar(
        title: const Text('Tax Engine', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b), // Card color for AppBar
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateEditDialog(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(taxEngineProvider.notifier).fetchEntries(),
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  labelText: 'Search',
                  labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFF6366f1)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: const BorderSide(color: Color(0xFFf1f5f9)),
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: taxEngineState.isLoading
                  ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
                  : taxEngineState.error != null
                      ? Center(
                          child: Text('Error: ${taxEngineState.error}', style: const TextStyle(color: Colors.red)),
                        )
                      : taxEngineState.entries.isEmpty
                          ? const Center(
                              child: Text('No tax entries found.', style: TextStyle(color: Color(0xFFf1f5f9))),)
                          : ListView.builder(
                              itemCount: taxEngineState.entries.length,
                              itemBuilder: (context, index) {
                                final entry = taxEngineState.entries[index];
                                return Card(
                                  color: const Color(0xFF1e293b), // Card color
                                  margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  child: ListTile(
                                    title: Text(entry.name, style: const TextStyle(color: Color(0xFFf1f5f9))),
                                    subtitle: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Rate: ${_formatAmount(entry.rate)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                                        Text('Created: ${_formatDate(entry.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                                        _buildStatusBadge(entry.status),
                                      ],
                                    ),
                                    trailing: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        IconButton(
                                          icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                          onPressed: () => _showCreateEditDialog(entry: entry),
                                        ),
                                        IconButton(
                                          icon: const Icon(Icons.delete, color: Colors.redAccent),
                                          onPressed: () => _showDeleteConfirmationDialog(entry),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
            ),
          ],
        ),
      ),
    );
  }
}
