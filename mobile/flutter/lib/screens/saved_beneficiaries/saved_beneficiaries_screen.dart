
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a simple Beneficiary model for demonstration
class Beneficiary {
  final String id;
  final String name;
  final String accountNumber;
  final String bankName;
  final double amount;
  final DateTime createdAt;
  final String status;

  Beneficiary({
    required this.id,
    required this.name,
    required this.accountNumber,
    required this.bankName,
    required this.amount,
    required this.createdAt,
    required this.status,
  });

  factory Beneficiary.fromJson(Map<String, dynamic> json) {
    return Beneficiary(
      id: json['id'],
      name: json['name'],
      accountNumber: json['accountNumber'],
      bankName: json['bankName'],
      amount: (json['amount'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt']),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'accountNumber': accountNumber,
        'bankName': bankName,
        'amount': amount,
        'createdAt': createdAt.toIso8601String(),
        'status': status,
      };

  Beneficiary copyWith({
    String? id,
    String? name,
    String? accountNumber,
    String? bankName,
    double? amount,
    DateTime? createdAt,
    String? status,
  }) {
    return Beneficiary(
      id: id ?? this.id,
      name: name ?? this.name,
      accountNumber: accountNumber ?? this.accountNumber,
      bankName: bankName ?? this.bankName,
      amount: amount ?? this.amount,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
    );
  }
}

// Riverpod provider for beneficiaries list
final beneficiariesProvider = FutureProvider.autoDispose<List<Beneficiary>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  final response = await api.get('/trpc/beneficiaries.list', params: {});
  // Assuming response.data is a List<Map<String, dynamic>>
  return (response.data as List).map((e) => Beneficiary.fromJson(e)).toList();
});

// Riverpod provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Riverpod provider for filtered beneficiaries
final filteredBeneficiariesProvider = Provider.autoDispose<List<Beneficiary>>((ref) {
  final beneficiariesAsyncValue = ref.watch(beneficiariesProvider);
  final searchQuery = ref.watch(searchQueryProvider).toLowerCase();

  return beneficiariesAsyncValue.when(
    data: (beneficiaries) {
      if (searchQuery.isEmpty) {
        return beneficiaries;
      }
      return beneficiaries.where((beneficiary) {
        return beneficiary.name.toLowerCase().contains(searchQuery) ||
               beneficiary.accountNumber.toLowerCase().contains(searchQuery) ||
               beneficiary.bankName.toLowerCase().contains(searchQuery);
      }).toList();
    },
    loading: () => [],
    error: (err, stack) => [],
  );
});

class SavedBeneficiariesScreen extends ConsumerStatefulWidget {
  const SavedBeneficiariesScreen({super.key});

  @override
  ConsumerState<SavedBeneficiariesScreen> createState() => _SavedBeneficiariesScreenState();
}

class _SavedBeneficiariesScreenState extends ConsumerState<SavedBeneficiariesScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshBeneficiaries() async {
    ref.invalidate(beneficiariesProvider);
    await ref.read(beneficiariesProvider.future);
  }

  // Function to show create/edit beneficiary dialog
  void _showBeneficiaryDialog({Beneficiary? beneficiary}) {
    final isEditing = beneficiary != null;
    final nameController = TextEditingController(text: beneficiary?.name);
    final accountNumberController = TextEditingController(text: beneficiary?.accountNumber);
    final bankNameController = TextEditingController(text: beneficiary?.bankName);
    final amountController = TextEditingController(text: beneficiary?.amount.toStringAsFixed(2));

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(isEditing ? 'Edit Beneficiary' : 'Add Beneficiary'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(labelText: 'Beneficiary Name'),
                ),
                TextField(
                  controller: accountNumberController,
                  decoration: const InputDecoration(labelText: 'Account Number'),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: bankNameController,
                  decoration: const InputDecoration(labelText: 'Bank Name'),
                ),
                TextField(
                  controller: amountController,
                  decoration: const InputDecoration(labelText: 'Amount (₦)'),
                  keyboardType: TextInputType.number,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                final newBeneficiary = Beneficiary(
                  id: beneficiary?.id ?? UniqueKey().toString(),
                  name: nameController.text,
                  accountNumber: accountNumberController.text,
                  bankName: bankNameController.text,
                  amount: double.tryParse(amountController.text) ?? 0.0,
                  createdAt: beneficiary?.createdAt ?? DateTime.now(),
                  status: beneficiary?.status ?? 'Active', // Default status
                );

                try {
                  if (isEditing) {
                    // Simulate API call for update
                    await ref.read(apiServiceProvider).post(
                      '/trpc/beneficiaries.update',
                      body: newBeneficiary.toJson(),
                    );
                  } else {
                    // Simulate API call for create
                    await ref.read(apiServiceProvider).post(
                      '/trpc/beneficiaries.create',
                      body: newBeneficiary.toJson(),
                    );
                  }
                  _refreshBeneficiaries(); // Refresh list after CRUD operation
                  Navigator.of(context).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to save beneficiary: $e')),
                  );
                }
              },
              child: Text(isEditing ? 'Save' : 'Add'),
            ),
          ],
        );
      },
    );
  }

  // Function to show delete confirmation dialog
  void _confirmDeleteBeneficiary(Beneficiary beneficiary) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Delete Beneficiary'),
          content: Text('Are you sure you want to delete ${beneficiary.name}?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () async {
                try {
                  // Simulate API call for delete
                  await ref.read(apiServiceProvider).post(
                    '/trpc/beneficiaries.delete',
                    body: {'id': beneficiary.id},
                  );
                  _refreshBeneficiaries(); // Refresh list after deletion
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete beneficiary: $e')),
                  );
                }
              },
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredBeneficiariesAsyncValue = ref.watch(filteredBeneficiariesProvider);

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
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xFF6366f1),
          foregroundColor: Color(0xFFf1f5f9),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF6366f1),
            foregroundColor: const Color(0xFFf1f5f9),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF6366f1),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
          hintStyle: TextStyle(color: Color(0xFF94a3b8)),
          enabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFF334155)),
          ),
          focusedBorder: OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFF6366f1)),
          ),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Saved Beneficiaries'),
          actions: [
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: () => _showBeneficiaryDialog(),
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
                  labelText: 'Search Beneficiaries',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _searchController.clear();
                            ref.read(searchQueryProvider.notifier).state = '';
                          },
                        )
                      : null,
                ),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refreshBeneficiaries,
                child: filteredBeneficiariesAsyncValue.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (err, stack) => Center(child: Text('Error: $err')),
                  data: (beneficiaries) {
                    if (beneficiaries.isEmpty) {
                      return const Center(child: Text('No beneficiaries found.'));
                    }
                    return ListView.builder(
                      itemCount: beneficiaries.length,
                      itemBuilder: (context, index) {
                        final beneficiary = beneficiaries[index];
                        return Card(
                          margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                          child: ListTile(
                            title: Text(beneficiary.name),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Account: ${beneficiary.accountNumber}'),
                                Text('Bank: ${beneficiary.bankName}'),
                                Text('Amount: ₦${beneficiary.amount.toStringAsFixed(2)}'),
                                Row(
                                  children: [
                                    const Text('Status: '),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: beneficiary.status == 'Active' ? Colors.green[700] : Colors.red[700],
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        beneficiary.status,
                                        style: const TextStyle(color: Colors.white, fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                                Text('Added: ${beneficiary.createdAt.toLocal().toString().split(' ')[0]}'),
                              ],
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                  onPressed: () => _showBeneficiaryDialog(beneficiary: beneficiary),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.redAccent),
                                  onPressed: () => _confirmDeleteBeneficiary(beneficiary),
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
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => _showBeneficiaryDialog(),
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}
