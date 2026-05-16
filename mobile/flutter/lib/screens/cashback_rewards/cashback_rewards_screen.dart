import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date formatting

// Assuming a data model for CashbackReward
class CashbackReward {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final DateTime date;
  final String status;

  CashbackReward({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.date,
    required this.status,
  });

  factory CashbackReward.fromJson(Map<String, dynamic> json) {
    return CashbackReward(
      id: json['id'] as String,
      name: json['name'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      date: DateTime.parse(json['date'] as String),
      status: json['status'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'amount': amount,
        'currency': currency,
        'date': date.toIso8601String(),
        'status': status,
      };
}

final searchQueryProvider = StateProvider<String>((ref) => '');

final cashbackRewardsProvider = FutureProvider.autoDispose<List<CashbackReward>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);
  try {
    // Map the tRPC router namespace from the page name: CashbackRewards -> cashback.list
    final response = await api.get('/trpc/cashback.list', params: {'search': searchQuery});
    // Assuming the response data is a list of maps
    return (response['data'] as List)
        .map((item) => CashbackReward.fromJson(item as Map<String, dynamic>))
        .toList();
  } catch (e) {
    // In a real app, you might want more sophisticated error handling
    throw Exception('Failed to load cashback rewards: $e');
  }
});

class CashbackRewardsScreen extends ConsumerStatefulWidget {
  const CashbackRewardsScreen({super.key});

  @override
  ConsumerState<CashbackRewardsScreen> createState() => _CashbackRewardsScreenState();
}

class _CashbackRewardsScreenState extends ConsumerState<CashbackRewardsScreen> {
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

  // Placeholder for create/edit dialog
  Future<void> _createOrEditReward({CashbackReward? reward}) async {
    // In a real app, this would open a dialog with form fields
    // and call api.post for create or api.put/post for edit
    print(reward == null ? 'Creating new reward' : 'Editing reward: ${reward.name}');
    // Example of calling a mutation (replace with actual tRPC mutation)
    if (reward == null) {
      // await ref.read(apiServiceProvider).post('/trpc/cashback.create', body: {'name': 'New Reward', 'amount': 100.0, 'currency': 'USD', 'date': DateTime.now().toIso8601String(), 'status': 'pending'});
    } else {
      // await ref.read(apiServiceProvider).post('/trpc/cashback.update', body: reward.toJson());
    }
    // After successful operation, refresh the list
    ref.invalidate(cashbackRewardsProvider);
  }

  // Placeholder for delete confirmation dialog and API call
  Future<void> _deleteReward(String id) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Confirm Delete'),
          content: const Text('Are you sure you want to delete this reward?'),
          backgroundColor: const Color(0xFF1e293b), // Dark theme for dialog
          titleTextStyle: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 20), // Dark theme for dialog title
          contentTextStyle: const TextStyle(color: Color(0xFFf1f5f9)), // Dark theme for dialog content
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))), // Dark theme for button
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent))), // Dark theme for button
          ],
        );
      },
    );

    if (confirm == true) {
      print('Deleting reward with ID: $id');
      // Call api.post('/trpc/cashback.delete', body: {'id': id});
      // After successful deletion, refresh the list
      ref.invalidate(cashbackRewardsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cashbackRewardsAsyncValue = ref.watch(cashbackRewardsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cashback Rewards'),
        backgroundColor: const Color(0xFF0f172a),
        foregroundColor: const Color(0xFFf1f5f9),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search rewards...', 
                hintStyle: const TextStyle(color: Color(0xFF94a3b8)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF94a3b8)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Color(0xFF94a3b8)),
                        onPressed: () {
                          _searchController.clear();
                          ref.read(searchQueryProvider.notifier).state = '';
                        },
                      )
                    : null,
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      backgroundColor: const Color(0xFF0f172a),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(cashbackRewardsProvider.future),
        color: const Color(0xFF6366f1), // Color of the refresh indicator
        child: cashbackRewardsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
          error: (err, stack) => Center(
            child: Text(
              'Error: $err',
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          data: (rewards) {
            if (rewards.isEmpty) {
              return LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: constraints.maxHeight),
                      child: const Center(
                        child: Text(
                          'No cashback rewards found.',
                          style: TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                      ),
                    ),
                  );
                },
              );
            }
            return ListView.builder(
              itemCount: rewards.length,
              itemBuilder: (context, index) {
                final reward = rewards[index];
                // Format amount based on currency
                final String formattedAmount = reward.currency == 'NGN'
                    ? '₦${NumberFormat('#,##0.00').format(reward.amount)}'
                    : '$${NumberFormat('#,##0.00').format(reward.amount)}';
                // Format date
                final String formattedDate = DateFormat('MMM dd, yyyy').format(reward.date);

                Color statusColor;
                switch (reward.status.toLowerCase()) {
                  case 'completed':
                    statusColor = Colors.green.shade700;
                    break;
                  case 'pending':
                    statusColor = Colors.orange.shade700;
                    break;
                  case 'cancelled':
                    statusColor = Colors.red.shade700;
                    break;
                  default:
                    statusColor = Colors.grey.shade700;
                }

                return Card(
                  color: const Color(0xFF1e293b),
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reward.name,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Amount: $formattedAmount',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Date: $formattedDate',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Text(
                              'Status: ',
                              style: TextStyle(color: Color(0xFFf1f5f9)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: statusColor,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                reward.status.toUpperCase(),
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                            const Spacer(),
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () => _createOrEditReward(reward: reward),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _deleteReward(reward.id),
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
        onPressed: () => _createOrEditReward(),
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}
