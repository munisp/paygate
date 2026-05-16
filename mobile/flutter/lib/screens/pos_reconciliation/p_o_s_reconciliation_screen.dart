import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define dark theme colors
const Color _darkBackground = Color(0xFF0f172a);
const Color _darkCard = Color(0xFF1e293b);
const Color _darkText = Color(0xFFf1f5f9);
const Color _darkAccent = Color(0xFF6366f1);

// Placeholder for tRPC router namespace
const String _posReconciliationNamespace = 'posReconciliation';

// Data model for a Reconciliation Entry
class ReconciliationEntry {
  final String id;
  final String terminalId;
  final String transactionRef;
  final double amount;
  final String currency;
  final DateTime transactionDate;
  final String status;

  ReconciliationEntry({
    required this.id,
    required this.terminalId,
    required this.transactionRef,
    required this.amount,
    required this.currency,
    required this.transactionDate,
    required this.status,
  });

  // Factory constructor for creating a new ReconciliationEntry from a map
  factory ReconciliationEntry.fromJson(Map<String, dynamic> json) {
    return ReconciliationEntry(
      id: json['id'] as String,
      terminalId: json['terminalId'] as String,
      transactionRef: json['transactionRef'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      transactionDate: DateTime.parse(json['transactionDate'] as String),
      status: json['status'] as String,
    );
  }

  // Method for converting a ReconciliationEntry to a map
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'terminalId': terminalId,
      'transactionRef': transactionRef,
      'amount': amount,
      'currency': currency,
      'transactionDate': transactionDate.toIso8601String(),
      'status': status,
    };
  }

  ReconciliationEntry copyWith({
    String? id,
    String? terminalId,
    String? transactionRef,
    double? amount,
    String? currency,
    DateTime? transactionDate,
    String? status,
  }) {
    return ReconciliationEntry(
      id: id ?? this.id,
      terminalId: terminalId ?? this.terminalId,
      transactionRef: transactionRef ?? this.transactionRef,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      transactionDate: transactionDate ?? this.transactionDate,
      status: status ?? this.status,
    );
  }
}

// StateNotifier for managing reconciliation entries
class ReconciliationEntriesNotifier extends StateNotifier<AsyncValue<List<ReconciliationEntry>>> {
  final ApiService apiService;
  ReconciliationEntriesNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchEntries();
  }

  Future<void> fetchEntries() async {
    state = const AsyncValue.loading();
    try {
      // Mock API call for listing entries
      // In a real scenario, this would be apiService.get('/trpc/posReconciliation.list', params: {...})
      await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
      final List<ReconciliationEntry> fetchedEntries = [
        ReconciliationEntry(id: '1', terminalId: 'T001', transactionRef: 'TRX001', amount: 1500.00, currency: 'NGN', transactionDate: DateTime.now().subtract(const Duration(days: 1)), status: 'Completed'),
        ReconciliationEntry(id: '2', terminalId: 'T002', transactionRef: 'TRX002', amount: 25.50, currency: 'USD', transactionDate: DateTime.now().subtract(const Duration(days: 2)), status: 'Pending'),
        ReconciliationEntry(id: '3', terminalId: 'T001', transactionRef: 'TRX003', amount: 5000.00, currency: 'NGN', transactionDate: DateTime.now().subtract(const Duration(days: 3)), status: 'Failed'),
        ReconciliationEntry(id: '4', terminalId: 'T003', transactionRef: 'TRX004', amount: 100.00, currency: 'USD', transactionDate: DateTime.now().subtract(const Duration(days: 1)), status: 'Completed'),
        ReconciliationEntry(id: '5', terminalId: 'T004', transactionRef: 'TRX005', amount: 750.00, currency: 'NGN', transactionDate: DateTime.now().subtract(const Duration(days: 5)), status: 'Pending'),
        ReconciliationEntry(id: '6', terminalId: 'T001', transactionRef: 'TRX006', amount: 120.00, currency: 'USD', transactionDate: DateTime.now().subtract(const Duration(days: 2)), status: 'Completed'),
      ];
      state = AsyncValue.data(fetchedEntries);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createEntry(ReconciliationEntry newEntry) async {
    try {
      // Mock API call for creating an entry
      await Future.delayed(const Duration(seconds: 1));
      final createdEntry = newEntry.copyWith(id: DateTime.now().millisecondsSinceEpoch.toString());
      state.whenData((entries) => state = AsyncValue.data([...entries, createdEntry]));
    } catch (e, st) {
      // Handle error, maybe show a snackbar
      debugPrint('Error creating entry: $e');
    }
  }

  Future<void> updateEntry(ReconciliationEntry updatedEntry) async {
    try {
      // Mock API call for updating an entry
      await Future.delayed(const Duration(seconds: 1));
      state.whenData((entries) {
        state = AsyncValue.data([
          for (final entry in entries)
            if (entry.id == updatedEntry.id) updatedEntry else entry,
        ]);
      });
    } catch (e, st) {
      debugPrint('Error updating entry: $e');
    }
  }

  Future<void> deleteEntry(String entryId) async {
    try {
      // Mock API call for deleting an entry
      await Future.delayed(const Duration(seconds: 1));
      state.whenData((entries) {
        state = AsyncValue.data(entries.where((entry) => entry.id != entryId).toList());
      });
    } catch (e, st) {
      debugPrint('Error deleting entry: $e');
    }
  }
}

// Riverpod provider for reconciliation entries
final reconciliationEntriesProvider = StateNotifierProvider<
    ReconciliationEntriesNotifier, AsyncValue<List<ReconciliationEntry>>>((ref) {
  final apiService = ref.watch(apiServiceProvider);
  return ReconciliationEntriesNotifier(apiService);
});

class POSReconciliationScreen extends ConsumerStatefulWidget {
  const POSReconciliationScreen({super.key});

  @override
  ConsumerState<POSReconciliationScreen> createState() => _POSReconciliationScreenState();
}

class _POSReconciliationScreenState extends ConsumerState<POSReconciliationScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String? _selectedStatusFilter;

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

  Future<void> _fetchReconciliationEntries() async {
    await ref.read(reconciliationEntriesProvider.notifier).fetchEntries();
  }

  List<ReconciliationEntry> _filterEntries(List<ReconciliationEntry> entries) {
    List<ReconciliationEntry> filtered = entries.where((entry) {
      final matchesSearchQuery = entry.terminalId.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          entry.transactionRef.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesStatus = _selectedStatusFilter == null || entry.status == _selectedStatusFilter;
      return matchesSearchQuery && matchesStatus;
    }).toList();
    return filtered;
  }

  void _showStatusFilterDialog() {
    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Filter by Status', style: TextStyle(color: _darkText)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String?>(
              title: const Text('All', style: TextStyle(color: _darkText)),
              value: null,
              groupValue: _selectedStatusFilter,
              onChanged: (value) {
                setState(() {
                  _selectedStatusFilter = value;
                });
                Navigator.of(context).pop();
              },
              activeColor: _darkAccent,
            ),
            RadioListTile<String?>(
              title: const Text('Completed', style: TextStyle(color: _darkText)),
              value: 'Completed',
              groupValue: _selectedStatusFilter,
              onChanged: (value) {
                setState(() {
                  _selectedStatusFilter = value;
                });
                Navigator.of(context).pop();
              },
              activeColor: _darkAccent,
            ),
            RadioListTile<String?>(
              title: const Text('Pending', style: TextStyle(color: _darkText)),
              value: 'Pending',
              groupValue: _selectedStatusFilter,
              onChanged: (value) {
                setState(() {
                  _selectedStatusFilter = value;
                });
                Navigator.of(context).pop();
              },
              activeColor: _darkAccent,
            ),
            RadioListTile<String?>(
              title: const Text('Failed', style: TextStyle(color: _darkText)),
              value: 'Failed',
              groupValue: _selectedStatusFilter,
              onChanged: (value) {
                setState(() {
                  _selectedStatusFilter = value;
                });
                Navigator.of(context).pop();
              },
              activeColor: _darkAccent,
            ),
          ],
        ),
      );
    });
  }

  void _showCreateEntryDialog() {
    final _terminalIdController = TextEditingController();
    final _transactionRefController = TextEditingController();
    final _amountController = TextEditingController();
    String _selectedCurrency = 'NGN'; // Default currency
    String _selectedStatus = 'Pending'; // Default status

    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Create New Entry', style: TextStyle(color: _darkText)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _terminalIdController,
                decoration: const InputDecoration(
                  labelText: 'Terminal ID',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              TextField(
                controller: _transactionRefController,
                decoration: const InputDecoration(
                  labelText: 'Transaction Reference',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              DropdownButtonFormField<String>(
                value: _selectedCurrency,
                dropdownColor: _darkCard,
                style: const TextStyle(color: _darkText),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                items: <String>['NGN', 'USD'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _darkText)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    _selectedCurrency = newValue;
                  }
                },
              ),
              DropdownButtonFormField<String>(
                value: _selectedStatus,
                dropdownColor: _darkCard,
                style: const TextStyle(color: _darkText),
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                items: <String>['Completed', 'Pending', 'Failed'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _darkText)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    _selectedStatus = newValue;
                  }
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              final newEntry = ReconciliationEntry(
                id: '', // ID will be generated by the notifier
                terminalId: _terminalIdController.text,
                transactionRef: _transactionRefController.text,
                amount: double.tryParse(_amountController.text) ?? 0.0,
                currency: _selectedCurrency,
                transactionDate: DateTime.now(),
                status: _selectedStatus,
              );
              ref.read(reconciliationEntriesProvider.notifier).createEntry(newEntry);
              Navigator.of(context).pop();
            },
            child: const Text('Create', style: TextStyle(color: _darkAccent)),
          ),
        ],
      );
    });
  }

  void _showEditEntryDialog(ReconciliationEntry entry) {
    final _terminalIdController = TextEditingController(text: entry.terminalId);
    final _transactionRefController = TextEditingController(text: entry.transactionRef);
    final _amountController = TextEditingController(text: entry.amount.toString());
    String _selectedCurrency = entry.currency;
    String _selectedStatus = entry.status;

    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Edit Entry', style: TextStyle(color: _darkText)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _terminalIdController,
                decoration: const InputDecoration(
                  labelText: 'Terminal ID',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              TextField(
                controller: _transactionRefController,
                decoration: const InputDecoration(
                  labelText: 'Transaction Reference',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                style: const TextStyle(color: _darkText),
              ),
              DropdownButtonFormField<String>(
                value: _selectedCurrency,
                dropdownColor: _darkCard,
                style: const TextStyle(color: _darkText),
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                items: <String>['NGN', 'USD'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _darkText)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    _selectedCurrency = newValue;
                  }
                },
              ),
              DropdownButtonFormField<String>(
                value: _selectedStatus,
                dropdownColor: _darkCard,
                style: const TextStyle(color: _darkText),
                decoration: const InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _darkText),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkText)),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _darkAccent)),
                ),
                items: <String>['Completed', 'Pending', 'Failed'].map((String value) {
                  return DropdownMenuItem<String>(
                    value: value,
                    child: Text(value, style: const TextStyle(color: _darkText)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    _selectedStatus = newValue;
                  }
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              final updatedEntry = entry.copyWith(
                terminalId: _terminalIdController.text,
                transactionRef: _transactionRefController.text,
                amount: double.tryParse(_amountController.text) ?? 0.0,
                currency: _selectedCurrency,
                status: _selectedStatus,
              );
              ref.read(reconciliationEntriesProvider.notifier).updateEntry(updatedEntry);
              Navigator.of(context).pop();
            },
            child: const Text('Update', style: TextStyle(color: _darkAccent)),
          ),
        ],
      );
    });
  }

  void _showDeleteConfirmationDialog(ReconciliationEntry entry) {
    showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _darkCard,
        title: const Text('Delete Entry', style: TextStyle(color: Colors.redAccent)),
        content: Text('Are you sure you want to delete the entry with Transaction Ref: ${entry.transactionRef}?', style: const TextStyle(color: _darkText)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _darkText)),
          ),
          TextButton(
            onPressed: () {
              ref.read(reconciliationEntriesProvider.notifier).deleteEntry(entry.id);
              Navigator.of(context).pop();
            },
            child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<ReconciliationEntry>> reconciliationEntries = ref.watch(reconciliationEntriesProvider);

    return Scaffold(
      backgroundColor: _darkBackground,
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Search by Terminal ID or Transaction Ref',
            hintStyle: const TextStyle(color: _darkText),
            border: InputBorder.none,
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear, color: _darkText),
                    onPressed: () {
                      _searchController.clear();
                      setState(() {
                        _searchQuery = '';
                      });
                    },
                  )
                : null,
          ),
          style: const TextStyle(color: _darkText),
        ),
        backgroundColor: _darkCard,
        iconTheme: const IconThemeData(color: _darkText),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list, color: _darkText),
            onPressed: _showStatusFilterDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchReconciliationEntries,
        color: _darkAccent,
        backgroundColor: _darkCard,
        child: reconciliationEntries.when(
          data: (entries) {
            final filteredEntries = _filterEntries(entries);
            if (filteredEntries.isEmpty) {
              return Center(
                child: Text(
                  _searchQuery.isNotEmpty || _selectedStatusFilter != null
                      ? 'No matching reconciliation entries found.'
                      : 'No reconciliation entries found.',
                  style: const TextStyle(color: _darkText, fontSize: 16),
                ),
              );
            }
            return ListView.builder(
              itemCount: filteredEntries.length,
              itemBuilder: (context, index) {
                final entry = filteredEntries[index];
                return Card(
                  color: _darkCard,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Terminal ID: ${entry.terminalId}', style: const TextStyle(color: _darkText)),
                        Text('Transaction Ref: ${entry.transactionRef}', style: const TextStyle(color: _darkText)),
                        Text('Amount: ${entry.currency == 'NGN' ? '₦' : '$'}${entry.amount.toStringAsFixed(2)}', style: const TextStyle(color: _darkText)),
                        Text('Date: ${entry.transactionDate.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: _darkText)),
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: _darkText)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: entry.status == 'Completed' ? Colors.green.shade700 : (entry.status == 'Pending' ? Colors.orange.shade700 : Colors.red.shade700),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(entry.status, style: const TextStyle(color: Colors.white, fontSize: 12)),
                            ),
                          ],
                        ),
                        // Action buttons for CRUD
                        Align(
                          alignment: Alignment.bottomRight,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: _darkAccent),
                                onPressed: () {
                                  _showEditEntryDialog(entry);
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () {
                                  _showDeleteConfirmationDialog(entry);
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: _darkAccent)),
          error: (err, stack) => Center(
            child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent)),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateEntryDialog();
        },
        backgroundColor: _darkAccent,
        child: const Icon(Icons.add, color: _darkText),
      ),
    );
  }
}
