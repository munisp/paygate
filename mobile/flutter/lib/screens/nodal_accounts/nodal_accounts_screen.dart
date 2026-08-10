
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dummy NodalAccount Model
class NodalAccount {
  final String id;
  final String name;
  final String type;
  final double balance;
  final String currency;
  final String status;
  final DateTime createdAt;

  NodalAccount({
    required this.id,
    required this.name,
    required this.type,
    required this.balance,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory NodalAccount.fromJson(Map<String, dynamic> json) {
    return NodalAccount(
      id: json['id'],
      name: json['name'],
      type: json['type'],
      balance: (json['balance'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}

// Provider for Nodal Accounts
final nodalAccountsProvider = FutureProvider.family<List<NodalAccount>, String?>((ref, query) async {
  // Simulate API call
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/nodalAccounts.list', params: {'query': query});
  // In a real app, you'd parse the response into a List<NodalAccount>
  // For now, return dummy data
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  final List<NodalAccount> allAccounts = [
    NodalAccount(id: '1', name: 'Main Wallet', type: 'Wallet', balance: 150000.00, currency: 'NGN', status: 'active', createdAt: DateTime(2023, 1, 15)),
    NodalAccount(id: '2', name: 'Savings Account', type: 'Savings', balance: 5000.50, currency: 'USD', status: 'inactive', createdAt: DateTime(2023, 3, 20)),
    NodalAccount(id: '3', name: 'Investment Fund', type: 'Investment', balance: 25000.00, currency: 'NGN', status: 'active', createdAt: DateTime(2023, 5, 10)),
    NodalAccount(id: '4', name: 'Merchant Escrow', type: 'Escrow', balance: 1000.00, currency: 'USD', status: 'pending', createdAt: DateTime(2023, 7, 1)),
    NodalAccount(id: '5', name: 'Payout Account', type: 'Wallet', balance: 75000.00, currency: 'NGN', status: 'active', createdAt: DateTime(2023, 9, 5)),
  ];

  if (query != null && query.isNotEmpty) {
    return allAccounts.where((account) =>
      account.name.toLowerCase().contains(query.toLowerCase()) ||
      account.type.toLowerCase().contains(query.toLowerCase())
    ).toList();
  } else {
    return allAccounts;
  }
});

// Create/Update/Delete providers (placeholders)
final createNodalAccountProvider = FutureProvider.family<void, NodalAccount>((ref, account) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/nodalAccounts.create', body: account);
  ref.invalidate(nodalAccountsProvider);
});

final updateNodalAccountProvider = FutureProvider.family<void, NodalAccount>((ref, account) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/nodalAccounts.update', body: account);
  ref.invalidate(nodalAccountsProvider);
});

final deleteNodalAccountProvider = FutureProvider.family<void, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  await api.post('/trpc/nodalAccounts.delete', body: {'id': id});
  ref.invalidate(nodalAccountsProvider);
});

class NodalAccountsScreen extends ConsumerStatefulWidget {
  const NodalAccountsScreen({super.key});

  @override
  ConsumerState<NodalAccountsScreen> createState() => _NodalAccountsScreenState();
}

class _NodalAccountsScreenState extends ConsumerState<NodalAccountsScreen> {
  final TextEditingController _searchController = TextEditingController();
  String? _searchQuery;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text.isEmpty ? null : _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshAccounts() async {
    ref.invalidate(nodalAccountsProvider);
    await ref.read(nodalAccountsProvider(_searchQuery).future);
  }

  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  @override
  Widget build(BuildContext context) {
    final nodalAccountsAsyncValue = ref.watch(nodalAccountsProvider(_searchQuery));

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Nodal Accounts', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: () => _showCreateDialog(context),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search accounts...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshAccounts,
              color: _accentColor,
              backgroundColor: _cardColor,
              child: nodalAccountsAsyncValue.when(
                data: (accounts) {
                  if (accounts.isEmpty) {
                    return const Center(
                      child: Text(
                        'No nodal accounts found.',
                        style: TextStyle(color: _textColor, fontSize: 16),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: accounts.length,
                    itemBuilder: (context, index) {
                      final account = accounts[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(account.name, style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Type: ${account.type}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                              Text(
                                'Balance: ${account.currency == 'NGN' ? '₦' : '$'}${account.balance.toStringAsFixed(2)}',
                                style: TextStyle(color: _textColor.withOpacity(0.8)),
                              ),
                              _buildStatusBadge(account.status),
                              Text('Created: ${account.createdAt.toLocal().toString().split(' ')[0]}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: _accentColor),
                                onPressed: () => _showEditDialog(context, account),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(context, account.id),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: ${err.toString()}', style: const TextStyle(color: Colors.redAccent, fontSize: 16)),
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
    Color textColor = Colors.white;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'inactive':
        badgeColor = Colors.orange;
        break;
      case 'pending':
        badgeColor = Colors.blue;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(status.toUpperCase(), style: TextStyle(color: textColor, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }

  void _showCreateDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Create Nodal Account', style: TextStyle(color: _textColor)),
        content: const Text('Form for creating a new nodal account will go here.', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          ElevatedButton(
            onPressed: () {
              // Simulate create API call
              // ref.read(createNodalAccountProvider(newAccount));
              Navigator.of(context).pop();
              _refreshAccounts(); // Refresh list after action
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: const Text('Create', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(BuildContext context, NodalAccount account) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Edit ${account.name}', style: const TextStyle(color: _textColor)),
        content: const Text('Form for editing nodal account will go here.', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          ElevatedButton(
            onPressed: () {
              // Simulate update API call
              // ref.read(updateNodalAccountProvider(updatedAccount));
              Navigator.of(context).pop();
              _refreshAccounts(); // Refresh list after action
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String accountId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: const Text('Delete Nodal Account', style: TextStyle(color: _textColor)),
        content: const Text('Are you sure you want to delete this nodal account?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          ElevatedButton(
            onPressed: () {
              // Simulate delete API call
              // ref.read(deleteNodalAccountProvider(accountId));
              Navigator.of(context).pop();
              _refreshAccounts(); // Refresh list after action
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
