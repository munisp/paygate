import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a simple data model for KYB Verification
class KybVerification {
  final String id;
  final String businessName;
  final String status;
  final DateTime submissionDate;
  final double amount;

  KybVerification({
    required this.id,
    required this.businessName,
    required this.status,
    required this.submissionDate,
    required this.amount,
  });

  factory KybVerification.fromJson(Map<String, dynamic> json) {
    return KybVerification(
      id: json['id'],
      businessName: json['businessName'],
      status: json['status'],
      submissionDate: DateTime.parse(json['submissionDate']),
      amount: json['amount'].toDouble(),
    );
  }
}

// Riverpod provider for fetching KYB Verifications
final kybVerificationsProvider = FutureProvider.autoDispose<List<KybVerification>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/kyb.listVerifications');
  // Assuming the response data is a List<Map<String, dynamic>>
  return (response.data as List).map((e) => KybVerification.fromJson(e as Map<String, dynamic>)).toList();
});

class KYBVerificationsScreen extends ConsumerStatefulWidget {
  const KYBVerificationsScreen({super.key});

  @override
  ConsumerState<KYBVerificationsScreen> createState() => _KYBVerificationsScreenState();
}

class _KYBVerificationsScreenState extends ConsumerState<KYBVerificationsScreen> {
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final kybVerificationsAsyncValue = ref.watch(kybVerificationsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('KYB Verifications', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card/AppBar background
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: () => _showCreateDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(kybVerificationsProvider.future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                onChanged: (query) {
                  setState(() {
                    _searchQuery = query;
                  });
                },
                decoration: InputDecoration(
                  hintText: 'Search by business name...',
                  hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.6)),
                  prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                  filled: true,
                  fillColor: const Color(0xFF1e293b), // Card/Input background
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: kybVerificationsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9)))),
                data: (verifications) {
                  final filteredVerifications = verifications.where((verification) {
                    return verification.businessName.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (verifications.isEmpty) {
                    return const Center(child: Text("No KYB verifications found.", style: TextStyle(color: Color(0xFFf1f5f9))));
                  }

                  if (filteredVerifications.isEmpty && _searchQuery.isNotEmpty) {
                    return const Center(child: Text("No matching KYB verifications found.", style: TextStyle(color: Color(0xFFf1f5f9))));
                  }

                  return ListView.builder(
                    itemCount: filteredVerifications.length,
                    itemBuilder: (context, index) {
                      final verification = filteredVerifications[index];
                      return Card(
                        color: const Color(0xFF1e293b), // Card background
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(verification.businessName, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Status: ${verification.status}', style: TextStyle(color: _getStatusColor(verification.status))), // Status badge logic
                              Text('Submission Date: ${_formatDate(verification.submissionDate)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Amount: ${_formatAmount(verification.amount)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                                onPressed: () => _showEditDialog(context, verification),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent), // Delete color
                                onPressed: () => _confirmDelete(context, verification.id),
                              ),
                            ],
                          ),
                          onTap: () => _navigateToDetail(context, verification),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending':
        return Colors.orange;
      case 'Approved':
        return Colors.green;
      case 'Rejected':
        return Colors.red;
      default:
        return const Color(0xFFf1f5f9);
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}'; // Simple date format
  }

  String _formatAmount(double amount) {
    // Assuming Naira for now, can be made dynamic
    return '₦${amount.toStringAsFixed(2)}';
  }

  void _showCreateDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Verification', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  decoration: const InputDecoration(labelText: 'Business Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  decoration: const InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                // Add more fields as needed
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                // TODO: Implement actual create API call
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Create', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, KybVerification verification) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Verification', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: TextEditingController(text: verification.businessName),
                  decoration: const InputDecoration(labelText: 'Business Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: TextEditingController(text: verification.amount.toStringAsFixed(2)),
                  decoration: const InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                // Add more fields as needed
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                // TODO: Implement actual update API call
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)),
              child: const Text('Save', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(BuildContext context, String verificationId) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this verification?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
            ElevatedButton(
              onPressed: () {
                // TODO: Implement actual delete API call
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }

  void _navigateToDetail(BuildContext context, KybVerification verification) {
    // For simplicity, we'll just show a dialog with details. In a real app,
    // you'd navigate to a new screen.
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text(verification.businessName, style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('ID: ${verification.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              Text('Status: ${verification.status}', style: TextStyle(color: _getStatusColor(verification.status))),
              Text('Submission Date: ${_formatDate(verification.submissionDate)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              Text('Amount: ${_formatAmount(verification.amount)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              // Add more details as needed
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close', style: TextStyle(color: Color(0xFFf1f5f9))),
            ),
          ],
        );
      },
    );
  }
}
