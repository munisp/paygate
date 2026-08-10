import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Data Model for Mutual Fund
class MutualFund {
  final String id;
  final String name;
  final String manager;
  final double value;
  final String currency;
  final double change;
  final DateTime lastUpdated;

  MutualFund({
    required this.id,
    required this.name,
    required this.manager,
    required this.value,
    required this.currency,
    required this.change,
    required this.lastUpdated,
  });

  factory MutualFund.fromJson(Map<String, dynamic> json) {
    return MutualFund(
      id: json['id'],
      name: json['name'],
      manager: json['manager'],
      value: json['value'].toDouble(),
      currency: json['currency'],
      change: json['change'].toDouble(),
      lastUpdated: DateTime.parse(json['lastUpdated']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'manager': manager,
        'value': value,
        'currency': currency,
        'change': change,
        'lastUpdated': lastUpdated.toIso8601String(),
      };
}

// State Notifier for Mutual Funds
class MutualFundsNotifier extends StateNotifier<AsyncValue<List<MutualFund>>> {
  final ApiService apiService;
  List<MutualFund> _allFunds = [];

  MutualFundsNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchMutualFunds();
  }

  Future<void> fetchMutualFunds() async {
    try {
      state = const AsyncValue.loading();
      final response = await apiService.get('/trpc/mutualFunds.list');
      _allFunds = (response['funds'] as List)
          .map((e) => MutualFund.fromJson(e as Map<String, dynamic>))
          .toList();
      state = AsyncValue.data(List.from(_allFunds)); // Return a new list to trigger UI update
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  void filterMutualFunds(String query) {
    if (query.isEmpty) {
      state = AsyncValue.data(List.from(_allFunds));
    } else {
      final filteredFunds = _allFunds.where((fund) {
        return fund.name.toLowerCase().contains(query.toLowerCase()) ||
            fund.manager.toLowerCase().contains(query.toLowerCase());
      }).toList();
      state = AsyncValue.data(filteredFunds);
    }
  }

  Future<void> createMutualFund(MutualFund newFund) async {
    try {
      await apiService.post('/trpc/mutualFunds.create', body: newFund.toJson());
      await fetchMutualFunds(); // Refresh the list after creation
    } catch (e, st) {
      // Handle error, maybe show a snackbar
      debugPrint('Error creating mutual fund: $e');
    }
  }

  Future<void> updateMutualFund(MutualFund updatedFund) async {
    try {
      await apiService.post('/trpc/mutualFunds.update', body: updatedFund.toJson());
      await fetchMutualFunds(); // Refresh the list after update
    } catch (e, st) {
      // Handle error
      debugPrint('Error updating mutual fund: $e');
    }
  }

  Future<void> deleteMutualFund(String fundId) async {
    try {
      await apiService.post('/trpc/mutualFunds.delete', body: {'id': fundId});
      await fetchMutualFunds(); // Refresh the list after deletion
    } catch (e, st) {
      // Handle error
      debugPrint('Error deleting mutual fund: $e');
    }
  }
}

// Provider for Mutual Funds Notifier
final mutualFundsProvider = StateNotifierProvider<
    MutualFundsNotifier, AsyncValue<List<MutualFund>>>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return MutualFundsNotifier(apiService);
});

class MutualFundsScreen extends ConsumerStatefulWidget {
  const MutualFundsScreen({super.key});

  @override
  ConsumerState<MutualFundsScreen> createState() => _MutualFundsScreenState();
}

class _MutualFundsScreenState extends ConsumerState<MutualFundsScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(mutualFundsProvider.notifier).filterMutualFunds(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _showFundDialog({MutualFund? fund}) async {
    final isEditing = fund != null;
    final nameController = TextEditingController(text: fund?.name);
    final managerController = TextEditingController(text: fund?.manager);
    final valueController = TextEditingController(text: fund?.value.toString());
    final currencyController = TextEditingController(text: fund?.currency ?? 'USD');
    final changeController = TextEditingController(text: fund?.change.toString());

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(isEditing ? 'Edit Mutual Fund' : 'Create Mutual Fund', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: managerController,
                  decoration: const InputDecoration(
                    labelText: 'Manager',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: valueController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Value',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: currencyController,
                  decoration: const InputDecoration(
                    labelText: 'Currency (e.g., USD, NGN)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: changeController,
                  keyboardType: TextInputType.number, // Allow decimal input
                  decoration: const InputDecoration(
                    labelText: 'Change (%)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: Text(isEditing ? 'Update' : 'Create', style: const TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                final newOrUpdatedFund = MutualFund(
                  id: fund?.id ?? UniqueKey().toString(), // Generate new ID if creating
                  name: nameController.text,
                  manager: managerController.text,
                  value: double.tryParse(valueController.text) ?? 0.0,
                  currency: currencyController.text,
                  change: double.tryParse(changeController.text) ?? 0.0,
                  lastUpdated: DateTime.now(),
                );
                if (isEditing) {
                  ref.read(mutualFundsProvider.notifier).updateMutualFund(newOrUpdatedFund);
                } else {
                  ref.read(mutualFundsProvider.notifier).createMutualFund(newOrUpdatedFund);
                }
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _confirmDelete(String fundId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this mutual fund?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () {
                ref.read(mutualFundsProvider.notifier).deleteMutualFund(fundId);
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
    final mutualFundsAsyncValue = ref.watch(mutualFundsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Mutual Funds', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search mutual funds...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF0f172a),
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
        onRefresh: () => ref.read(mutualFundsProvider.notifier).fetchMutualFunds(),
        child: mutualFundsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color for spinner
          error: (err, stack) => Center(
            child: Text(
              'Error: $err',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          data: (funds) {
            if (funds.isEmpty) {
              return const Center(
                child: Text(
                  'No mutual funds found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: funds.length,
              itemBuilder: (context, index) {
                final fund = funds[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          fund.name,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Manager: ${fund.manager}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Value: ${fund.currency == 'NGN' ? '₦' : '$'}${fund.value.toStringAsFixed(2)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Change: ${fund.change > 0 ? '+' : ''}${fund.change.toStringAsFixed(2)}%',
                          style: TextStyle(
                            color: fund.change > 0 ? Colors.green : Colors.red,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Last Updated: ${fund.lastUpdated.toLocal().toString().split(' ')[0]}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () => _showFundDialog(fund: fund),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.red),
                              onPressed: () => _confirmDelete(fund.id),
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
        onPressed: () => _showFundDialog(),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
