import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Placeholder for tRPC response model
class SalaryAccount {
  final String id;
  final String name;
  final double amount;
  final String currency;
  final DateTime lastPaymentDate;
  final String status;

  SalaryAccount({
    required this.id,
    required this.name,
    required this.amount,
    required this.currency,
    required this.lastPaymentDate,
    required this.status,
  });

  factory SalaryAccount.fromJson(Map<String, dynamic> json) {
    return SalaryAccount(
      id: json['id'],
      name: json['name'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      lastPaymentDate: DateTime.parse(json['lastPaymentDate']),
      status: json['status'],
    );
  }
}

// Placeholder for tRPC API provider
final salaryAccountsProvider = FutureProvider.autoDispose<List<SalaryAccount>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Simulate API call
  await Future.delayed(const Duration(seconds: 1));
  final response = await api.get('/trpc/salaryAccounts.list'); // Assuming 'salaryAccounts.list' as the tRPC router namespace
  // In a real scenario, parse the response into List<SalaryAccount>
  // For now, return dummy data
  return [
    SalaryAccount(id: '1', name: 'John Doe', amount: 150000.00, currency: 'NGN', lastPaymentDate: DateTime(2026, 4, 25), status: 'Active'),
    SalaryAccount(id: '2', name: 'Jane Smith', amount: 2000.00, currency: 'USD', lastPaymentDate: DateTime(2026, 4, 20), status: 'Pending'),
    SalaryAccount(id: '3', name: 'Peter Jones', amount: 80000.00, currency: 'NGN', lastPaymentDate: DateTime(2026, 3, 10), status: 'Inactive'),
    SalaryAccount(id: '4', name: 'Alice Brown', amount: 3500.00, currency: 'USD', lastPaymentDate: DateTime(2026, 5, 1), status: 'Active'),
  ];
});

class SalaryAccountsScreen extends ConsumerStatefulWidget {
  const SalaryAccountsScreen({super.key});

  @override
  ConsumerState<SalaryAccountsScreen> createState() => _SalaryAccountsScreenState();
}

class _SalaryAccountsScreenState extends ConsumerState<SalaryAccountsScreen> {
  @override
  Widget build(BuildContext context) {
    final salaryAccountsAsyncValue = ref.watch(salaryAccountsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Salary Accounts', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Icon color
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(salaryAccountsProvider.future),
        child: salaryAccountsAsyncValue.when(
          data: (accounts) {
            if (accounts.isEmpty) {
              return const Center(
                child: Text(
                  'No salary accounts found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            }
            return ListView.builder(
              itemCount: accounts.length,
              itemBuilder: (context, index) {
                final account = accounts[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          account.name,
                          style: const TextStyle(
                            color: Color(0xFFf1f5f9),
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Amount: ${account.currency == 'NGN' ? '₦' : '$'}${account.amount.toStringAsFixed(2)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        Text(
                          'Last Payment: ${account.lastPaymentDate.toLocal().toString().split(' ')[0]}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: account.status == 'Active' ? Colors.green.shade700 : (account.status == 'Pending' ? Colors.orange.shade700 : Colors.red.shade700),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                account.status,
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                            const Spacer(),
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                              onPressed: () {
                                // TODO: Implement edit functionality
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent), // Accent color
                              onPressed: () {
                                // TODO: Implement delete functionality
                              },
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
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
          error: (err, stack) => Center(
            child: Text(
              'Error: ${err.toString()}',
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Implement create functionality
        },
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}
