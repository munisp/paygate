import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define custom colors for the dark theme
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

// Data model for KYB Verification
class KybVerification {
  final String id;
  final String businessName;
  final String status;
  final DateTime submittedDate;

  KybVerification({
    required this.id,
    required this.businessName,
    required this.status,
    required this.submittedDate,
  });

  factory KybVerification.fromJson(Map<String, dynamic> json) {
    return KybVerification(
      id: json['id'] as String,
      businessName: json['businessName'] as String,
      status: json['status'] as String,
      submittedDate: DateTime.parse(json['submittedDate'] as String),
    );
  }
}

// Riverpod provider for fetching KYB verifications
final kybVerificationsProvider = FutureProvider.family<
    List<KybVerification>, Map<String, dynamic>>((ref, queryParams) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/kyb.listVerifications', params: queryParams);
  // Assuming response.data is a List<Map<String, dynamic>>
  return (response.data as List)
      .map((e) => KybVerification.fromJson(e as Map<String, dynamic>))
      .toList();
});

class KYBVerificationScreen extends ConsumerStatefulWidget {
  const KYBVerificationScreen({super.key});

  @override
  ConsumerState<KYBVerificationScreen> createState() => _KYBVerificationScreenState();
}

class _KYBVerificationScreenState extends ConsumerState<KYBVerificationScreen> {
  String _searchQuery = '';
  String? _filterStatus;

  @override
  Widget build(BuildContext context) {
    final queryParams = {
      'search': _searchQuery,
      if (_filterStatus != null) 'status': _filterStatus,
    };

    final kybVerificationsAsyncValue = ref.watch(kybVerificationsProvider(queryParams));

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('KYB Verification', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _accentColor),
            onPressed: () => _showCreateDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(kybVerificationsProvider(queryParams));
        },
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  hintText: 'Search by business name...',
                  hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: _textColor),
                  filled: true,
                  fillColor: _cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0),
              child: DropdownButtonFormField<String>(
                value: _filterStatus,
                decoration: InputDecoration(
                  labelText: 'Filter by Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  filled: true,
                  fillColor: _cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
                dropdownColor: _cardColor,
                style: const TextStyle(color: _textColor),
                items: <String>['Pending', 'Approved', 'Rejected', 'All']
                    .map<DropdownMenuItem<String>>((String value) {
                  return DropdownMenuItem<String>(
                    value: value == 'All' ? null : value,
                    child: Text(value),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    _filterStatus = newValue;
                  });
                },
              ),
            ),
            Expanded(
              child: kybVerificationsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.red)),
                ),
                data: (verifications) {
                  if (verifications.isEmpty) {
                    return const Center(
                      child: Text('No KYB verifications found.', style: TextStyle(color: _textColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: verifications.length,
                    itemBuilder: (context, index) {
                      final verification = verifications[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.all(8.0),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Business: ${verification.businessName}',
                                style: const TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              _buildStatusBadge(verification.status),
                              const SizedBox(height: 8),
                              Text(
                                'Submitted: ${_formatDate(verification.submittedDate)}',
                                style: TextStyle(color: _textColor.withOpacity(0.8)),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: _accentColor),
                                    onPressed: () => _showEditDialog(context, verification),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _showDeleteConfirmationDialog(context, verification.id),
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
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;
    switch (status) {
      case 'Pending':
        badgeColor = Colors.orange;
        break;
      case 'Approved':
        badgeColor = Colors.green;
        break;
      case 'Rejected':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: textColor, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  // Placeholder for amount formatting if needed
  // String _formatAmount(double amount, String currency) {
  //   if (currency == 'NGN') {
  //     return '₦${amount.toStringAsFixed(2)}';
  //   } else if (currency == 'USD') {
  //     return '$${amount.toStringAsFixed(2)}';
  //   }
  //   return amount.toStringAsFixed(2);
  // }

  void _showCreateDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        String businessName = '';
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create KYB Verification', style: TextStyle(color: _textColor)),
          content: TextField(
            style: const TextStyle(color: _textColor),
            decoration: InputDecoration(
              hintText: 'Business Name',
              hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
              enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
            ),
            onChanged: (value) => businessName = value,
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                // Simulate API call for creation
                // await ref.read(apiServiceProvider).post('/trpc/kyb.createVerification', body: {'businessName': businessName});
                ref.invalidate(kybVerificationsProvider({})); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showEditDialog(BuildContext context, KybVerification verification) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        String newBusinessName = verification.businessName;
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit KYB Verification', style: TextStyle(color: _textColor)),
          content: TextField(
            style: const TextStyle(color: _textColor),
            controller: TextEditingController(text: newBusinessName),
            decoration: InputDecoration(
              hintText: 'Business Name',
              hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
              enabledBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
              focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
            ),
            onChanged: (value) => newBusinessName = value,
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                // Simulate API call for update
                // await ref.read(apiServiceProvider).post('/trpc/kyb.updateVerification', body: {'id': verification.id, 'businessName': newBusinessName});
                ref.invalidate(kybVerificationsProvider({})); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _showDeleteConfirmationDialog(BuildContext context, String verificationId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Delete KYB Verification', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to delete this verification?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () => Navigator.of(context).pop(),
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                // Simulate API call for deletion
                // await ref.read(apiServiceProvider).post('/trpc/kyb.deleteVerification', body: {'id': verificationId});
                ref.invalidate(kybVerificationsProvider({})); // Refresh list
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }
}