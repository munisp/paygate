import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the tRPC router namespace for InsuranceHub
// Assuming a tRPC router like `insurance.listPolicies`, `insurance.createPolicy`, etc.
// This is a placeholder and should be adjusted based on the actual tRPC API.
const String _insuranceListProcedure = 'insurance.listPolicies';
const String _insuranceCreateProcedure = 'insurance.createPolicy';
const String _insuranceUpdateProcedure = 'insurance.updatePolicy';
const String _insuranceDeleteProcedure = 'insurance.deletePolicy';

// Data model for an insurance policy (example)
class InsurancePolicy {
  final String id;
  final String policyNumber;
  final String customerName;
  final double premiumAmount;
  final String currency;
  final DateTime startDate;
  final DateTime endDate;
  final String status;

  InsurancePolicy({
    required this.id,
    required this.policyNumber,
    required this.customerName,
    required this.premiumAmount,
    required this.currency,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory InsurancePolicy.fromJson(Map<String, dynamic> json) {
    return InsurancePolicy(
      id: json['id'] as String,
      policyNumber: json['policyNumber'] as String,
      customerName: json['customerName'] as String,
      premiumAmount: (json['premiumAmount'] as num).toDouble(),
      currency: json['currency'] as String,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      status: json['status'] as String,
    );
  }
}

// Riverpod provider for fetching insurance policies
final insurancePoliciesProvider = FutureProvider.family<List<InsurancePolicy>, String>((ref, searchTerm) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get(
    '/trpc/$_insuranceListProcedure',
    params: {'searchTerm': searchTerm},
  );
  // Simulate API delay
  await Future.delayed(const Duration(seconds: 1));
  if (response.statusCode == 200) {
    final List<dynamic> data = response.data as List<dynamic>;
    return data.map((json) => InsurancePolicy.fromJson(json)).toList();
  } else {
    throw Exception('Failed to load insurance policies');
  }
});

class InsuranceHubScreen extends ConsumerStatefulWidget {
  const InsuranceHubScreen({super.key});

  @override
  ConsumerState<InsuranceHubScreen> createState() => _InsuranceHubScreenState();
}

class _InsuranceHubScreenState extends ConsumerState<InsuranceHubScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchTerm = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchTerm = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshPolicies() async {
    ref.invalidate(insurancePoliciesProvider(_searchTerm));
  }

  // Helper to format currency
  String _formatAmount(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or Dollar
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  // Helper to format date
  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // Helper to get status badge color
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'expired':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // CRUD: Create Policy Dialog
  Future<void> _showCreatePolicyDialog() async {
    // Placeholder for create policy dialog logic
    // In a real app, this would involve a form to input policy details
    // and then call a tRPC mutation via api.post('/trpc/insurance.createPolicy', body: {...})
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Create New Policy'),
          content: const Text('Form for creating a new insurance policy goes here.'),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel'),
              onPressed: () { Navigator.of(context).pop(); },
            ),
            TextButton(
              child: const Text('Create'),
              onPressed: () {
                // Simulate API call
                // ref.read(apiServiceProvider).post('/trpc/$_insuranceCreateProcedure', body: {...});
                Navigator.of(context).pop();
                _refreshPolicies(); // Refresh list after creation
              },
            ),
          ],
        );
      },
    );
  }

  // CRUD: Edit Policy Dialog
  Future<void> _showEditPolicyDialog(InsurancePolicy policy) async {
    // Placeholder for edit policy dialog logic
    // In a real app, this would involve a form pre-filled with policy details
    // and then call a tRPC mutation via api.post('/trpc/insurance.updatePolicy', body: {...})
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text('Edit Policy: ${policy.policyNumber}'),
          content: const Text('Form for editing insurance policy details goes here.'),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel'),
              onPressed: () { Navigator.of(context).pop(); },
            ),
            TextButton(
              child: const Text('Save'),
              onPressed: () {
                // Simulate API call
                // ref.read(apiServiceProvider).post('/trpc/$_insuranceUpdateProcedure', body: {...});
                Navigator.of(context).pop();
                _refreshPolicies(); // Refresh list after update
              },
            ),
          ],
        );
      },
    );
  }

  // CRUD: Delete Policy Confirmation
  Future<void> _showDeletePolicyConfirmation(InsurancePolicy policy) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Confirm Deletion'),
          content: Text('Are you sure you want to delete policy ${policy.policyNumber}?'),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel'),
              onPressed: () { Navigator.of(context).pop(); },
            ),
            TextButton(
              child: const Text('Delete'),
              onPressed: () async {
                // Call tRPC mutation to delete policy
                // final api = ref.read(apiServiceProvider);
                // await api.post('/trpc/$_insuranceDeleteProcedure', body: {'id': policy.id});
                Navigator.of(context).pop();
                _refreshPolicies(); // Refresh list after deletion
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<InsurancePolicy>> policiesAsyncValue = ref.watch(insurancePoliciesProvider(_searchTerm));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('Insurance Hub'),
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        foregroundColor: const Color(0xFFf1f5f9), // Text color
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search policies...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b), // Card/AppBar background
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)), // Text color
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshPolicies,
              color: const Color(0xFF6366f1), // Accent color for refresh indicator
              child: policiesAsyncValue.when(
                data: (policies) {
                  if (policies.isEmpty) {
                    return const Center(
                      child: Text(
                        'No insurance policies found.',
                        style: TextStyle(color: Color(0xFFf1f5f9)),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: policies.length,
                    itemBuilder: (context, index) {
                      final policy = policies[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b), // Card background
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Policy Number: ${policy.policyNumber}',
                                style: const TextStyle(
                                  color: Color(0xFFf1f5f9),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                'Customer: ${policy.customerName}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                'Amount: ${_formatAmount(policy.premiumAmount, policy.currency)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 4.0),
                              Text(
                                'Period: ${_formatDate(policy.startDate)} - ${_formatDate(policy.endDate)}',
                                style: const TextStyle(color: Color(0xFFf1f5f9)),
                              ),
                              const SizedBox(height: 8.0),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(policy.status),
                                      borderRadius: BorderRadius.circular(4.0),
                                    ),
                                    child: Text(
                                      policy.status,
                                      style: const TextStyle(color: Colors.white, fontSize: 12.0),
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      IconButton(
                                        icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                        onPressed: () => _showEditPolicyDialog(policy),
                                      ),
                                      IconButton(
                                        icon: const Icon(Icons.delete, color: Colors.redAccent), // Accent color
                                        onPressed: () => _showDeletePolicyConfirmation(policy),
                                      ),
                                    ],
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
                loading: () => const Center(
                  child: CircularProgressIndicator(color: Color(0xFF6366f1)), // Accent color
                ),
                error: (error, stack) => Center(
                  child: Text(
                    'Error: ${error.toString()}',
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreatePolicyDialog,
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
  }
}