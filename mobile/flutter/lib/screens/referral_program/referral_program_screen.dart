import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date formatting
import '../../services/api_service.dart';

// Data Models (as planned in Phase 1)
class ReferralProgramEntry {
  final String id;
  final String referralCode;
  final String referrerName;
  final String referrerEmail;
  final String referredUserName;
  final String referredUserEmail;
  final String status; // e.g., 'Pending', 'Approved', 'Rejected', 'Paid'
  final double amount; // Commission amount
  final String currency; // e.g., 'NGN', 'USD'
  final DateTime createdAt;
  final DateTime? paidAt;

  ReferralProgramEntry({
    required this.id,
    required this.referralCode,
    required this.referrerName,
    required this.referrerEmail,
    required this.referredUserName,
    required this.referredUserEmail,
    required this.status,
    required this.amount,
    required this.currency,
    required this.createdAt,
    this.paidAt,
  });

  factory ReferralProgramEntry.fromJson(Map<String, dynamic> json) {
    return ReferralProgramEntry(
      id: json['id'] as String,
      referralCode: json['referralCode'] as String,
      referrerName: json['referrerName'] as String,
      referrerEmail: json['referrerEmail'] as String,
      referredUserName: json['referredUserName'] as String,
      referredUserEmail: json['referredUserEmail'] as String,
      status: json['status'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      paidAt: json['paidAt'] != null ? DateTime.parse(json['paidAt'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'referralCode': referralCode,
        'referrerName': referrerName,
        'referrerEmail': referrerEmail,
        'referredUserName': referredUserName,
        'referredUserEmail': referredUserEmail,
        'status': status,
        'amount': amount,
        'currency': currency,
        'createdAt': createdAt.toIso8601String(),
        'paidAt': paidAt?.toIso8601String(),
      };
}

class ReferralProgramCreatePayload {
  final String referralCode;
  final String referrerName;
  final String referrerEmail;
  final String referredUserName;
  final String referredUserEmail;
  final double amount;
  final String currency;

  ReferralProgramCreatePayload({
    required this.referralCode,
    required this.referrerName,
    required this.referrerEmail,
    required this.referredUserName,
    required this.referredUserEmail,
    required this.amount,
    required this.currency,
  });

  Map<String, dynamic> toJson() => {
        'referralCode': referralCode,
        'referrerName': referrerName,
        'referrerEmail': referrerEmail,
        'referredUserName': referredUserName,
        'referredUserEmail': referredUserEmail,
        'amount': amount,
        'currency': currency,
      };
}

class ReferralProgramUpdatePayload {
  final String id;
  final String? referralCode;
  final String? referrerName;
  final String? referrerEmail;
  final String? referredUserName;
  final String? referredUserEmail;
  final String? status;
  final double? amount;
  final String? currency;
  final DateTime? paidAt;

  ReferralProgramUpdatePayload({
    required this.id,
    this.referralCode,
    this.referrerName,
    this.referrerEmail,
    this.referredUserName,
    this.referredUserEmail,
    this.status,
    this.amount,
    this.currency,
    this.paidAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        if (referralCode != null) 'referralCode': referralCode,
        if (referrerName != null) 'referrerName': referrerName,
        if (referrerEmail != null) 'referrerEmail': referrerEmail,
        if (referredUserName != null) 'referredUserName': referredUserName,
        if (referredUserEmail != null) 'referredUserEmail': referredUserEmail,
        if (status != null) 'status': status,
        if (amount != null) 'amount': amount,
        if (currency != null) 'currency': currency,
        if (paidAt != null) 'paidAt': paidAt?.toIso8601String(),
      };
}

// State Management with Riverpod
class ReferralProgramNotifier extends StateNotifier<AsyncValue<List<ReferralProgramEntry>>> {
  final ApiService _apiService;

  ReferralProgramNotifier(this._apiService) : super(const AsyncValue.loading()) {
    fetchReferralPrograms();
  }

  Future<void> fetchReferralPrograms({String? search}) async {
    try {
      state = const AsyncValue.loading();
      final response = await _apiService.get(
        '/trpc/referralProgram.list',
        params: search != null ? {'search': search} : {},
      );
      final List<ReferralProgramEntry> referrals = (
        response as List
      ).map((e) => ReferralProgramEntry.fromJson(e as Map<String, dynamic>)).toList();
      state = AsyncValue.data(referrals);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<bool> createReferralProgram(ReferralProgramCreatePayload payload) async {
    try {
      // No need to set loading state for the whole list here, as it will be re-fetched
      await _apiService.post(
        '/trpc/referralProgram.create',
        body: payload.toJson(),
      );
      await fetchReferralPrograms(); // Re-fetch to update the list
      return true;
    } catch (e, st) {
      // If only this specific operation needs to show an error, handle it locally in the UI
      debugPrint('Error creating referral: $e');
      return false;
    }
  }

  Future<bool> updateReferralProgram(ReferralProgramUpdatePayload payload) async {
    try {
      // No need to set loading state for the whole list here, as it will be re-fetched
      await _apiService.post(
        '/trpc/referralProgram.update',
        body: payload.toJson(),
      );
      await fetchReferralPrograms(); // Re-fetch to update the list
      return true;
    } catch (e, st) {
      debugPrint('Error updating referral: $e');
      return false;
    }
  }

  Future<bool> deleteReferralProgram(String id) async {
    try {
      // No need to set loading state for the whole list here, as it will be re-fetched
      await _apiService.post(
        '/trpc/referralProgram.delete',
        body: {'id': id},
      );
      await fetchReferralPrograms(); // Re-fetch to update the list
      return true;
    } catch (e, st) {
      debugPrint('Error deleting referral: $e');
      return false;
    }
  }
}

final referralProgramProvider = StateNotifierProvider<
    ReferralProgramNotifier, AsyncValue<List<ReferralProgramEntry>>>((ref) {
  final apiService = ref.read(apiServiceProvider);
  return ReferralProgramNotifier(apiService);
});

// ReferralProgramScreen Widget
class ReferralProgramScreen extends ConsumerStatefulWidget {
  const ReferralProgramScreen({super.key});

  @override
  ConsumerState<ReferralProgramScreen> createState() => _ReferralProgramScreenState();
}

class _ReferralProgramScreenState extends ConsumerState<ReferralProgramScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Initial fetch is handled by the provider's constructor
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Approved':
        return Colors.green;
      case 'Pending':
        return Colors.orange;
      case 'Rejected':
        return Colors.red;
      case 'Paid':
        return Colors.blue;
      default:
        return const Color(0xFFf1f5f9); // Default text color
    }
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  Future<void> _showCreateReferralDialog() async {
    final _referralCodeController = TextEditingController();
    final _referrerNameController = TextEditingController();
    final _referrerEmailController = TextEditingController();
    final _referredUserNameController = TextEditingController();
    final _referredUserEmailController = TextEditingController();
    final _amountController = TextEditingController();
    String _selectedCurrency = 'NGN'; // Default currency

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create New Referral', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _referralCodeController,
                  decoration: const InputDecoration(labelText: 'Referral Code', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referrerNameController,
                  decoration: const InputDecoration(labelText: 'Referrer Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referrerEmailController,
                  decoration: const InputDecoration(labelText: 'Referrer Email', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referredUserNameController,
                  decoration: const InputDecoration(labelText: 'Referred User Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referredUserEmailController,
                  decoration: const InputDecoration(labelText: 'Referred User Email', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _amountController,
                  decoration: const InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                DropdownButtonFormField<String>(
                  value: _selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: const InputDecoration(labelText: 'Currency', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      _selectedCurrency = newValue;
                    }
                  },
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
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final payload = ReferralProgramCreatePayload(
                  referralCode: _referralCodeController.text,
                  referrerName: _referrerNameController.text,
                  referrerEmail: _referrerEmailController.text,
                  referredUserName: _referredUserNameController.text,
                  referredUserEmail: _referredUserEmailController.text,
                  amount: double.tryParse(_amountController.text) ?? 0.0,
                  currency: _selectedCurrency,
                );
                final success = await ref.read(referralProgramProvider.notifier).createReferralProgram(payload);
                if (success) {
                  Navigator.of(context).pop();
                } else {
                  // Show error message
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to create referral program.')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEditReferralDialog(ReferralProgramEntry referral) async {
    final _referralCodeController = TextEditingController(text: referral.referralCode);
    final _referrerNameController = TextEditingController(text: referral.referrerName);
    final _referrerEmailController = TextEditingController(text: referral.referrerEmail);
    final _referredUserNameController = TextEditingController(text: referral.referredUserName);
    final _referredUserEmailController = TextEditingController(text: referral.referredUserEmail);
    final _amountController = TextEditingController(text: referral.amount.toString());
    String _selectedCurrency = referral.currency;
    String _selectedStatus = referral.status;
    bool _isPaid = referral.paidAt != null;

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Edit Referral', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _referralCodeController,
                  decoration: const InputDecoration(labelText: 'Referral Code', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referrerNameController,
                  decoration: const InputDecoration(labelText: 'Referrer Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referrerEmailController,
                  decoration: const InputDecoration(labelText: 'Referrer Email', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referredUserNameController,
                  decoration: const InputDecoration(labelText: 'Referred User Name', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _referredUserEmailController,
                  decoration: const InputDecoration(labelText: 'Referred User Email', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: _amountController,
                  decoration: const InputDecoration(labelText: 'Amount', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                DropdownButtonFormField<String>(
                  value: _selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: const InputDecoration(labelText: 'Currency', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  items: <String>['NGN', 'USD'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      setState(() {
                        _selectedCurrency = newValue;
                      });
                    }
                  },
                ),
                DropdownButtonFormField<String>(
                  value: _selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: const InputDecoration(labelText: 'Status', labelStyle: TextStyle(color: Color(0xFFf1f5f9))),
                  items: <String>['Pending', 'Approved', 'Rejected', 'Paid'].map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      setState(() {
                        _selectedStatus = newValue;
                      });
                    }
                  },
                ),
                CheckboxListTile(
                  title: const Text('Mark as Paid', style: TextStyle(color: Color(0xFFf1f5f9))),
                  value: _isPaid,
                  onChanged: (bool? newValue) {
                    if (newValue != null) {
                      setState(() {
                        _isPaid = newValue;
                      });
                    }
                  },
                  checkColor: const Color(0xFFf1f5f9),
                  activeColor: const Color(0xFF6366f1),
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
              child: const Text('Update', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                final payload = ReferralProgramUpdatePayload(
                  id: referral.id,
                  referralCode: _referralCodeController.text,
                  referrerName: _referrerNameController.text,
                  referrerEmail: _referrerEmailController.text,
                  referredUserName: _referredUserNameController.text,
                  referredUserEmail: _referredUserEmailController.text,
                  amount: double.tryParse(_amountController.text),
                  currency: _selectedCurrency,
                  status: _selectedStatus,
                  paidAt: _isPaid ? DateTime.now() : null,
                );
                final success = await ref.read(referralProgramProvider.notifier).updateReferralProgram(payload);
                if (success) {
                  Navigator.of(context).pop();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to update referral program.')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(String referralId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Delete Referral', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this referral program?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                final success = await ref.read(referralProgramProvider.notifier).deleteReferralProgram(referralId);
                if (success) {
                  Navigator.of(context).pop();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to delete referral program.')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final referralProgramsAsyncValue = ref.watch(referralProgramProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: "Search referrals...",
            hintStyle: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
            border: InputBorder.none,
            prefixIcon: Icon(Icons.search, color: Color(0xFFf1f5f9).withOpacity(0.7)),
          ),
          style: const TextStyle(color: Color(0xFFf1f5f9)),
          onChanged: (query) {
            ref.read(referralProgramProvider.notifier).fetchReferralPrograms(search: query);
          },
        ),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // White icons
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(referralProgramProvider.notifier).fetchReferralPrograms(),
        child: referralProgramsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color spinner
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
          data: (referralPrograms) {
            if (referralPrograms.isEmpty) {
              return const Center(
                child: Text('No referral programs found.', style: TextStyle(color: Color(0xFFf1f5f9))),
              );
            }
            return ListView.builder(
              itemCount: referralPrograms.length,
              itemBuilder: (context, index) {
                final referral = referralPrograms[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Code: ${referral.referralCode}', style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                        Text('Referrer: ${referral.referrerName} (${referral.referrerEmail})', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        Text('Referred: ${referral.referredUserName} (${referral.referredUserEmail})', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        Text('Amount: ${_formatAmount(referral.amount, referral.currency)}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Amount formatting
                        Text('Status: ${referral.status}', style: TextStyle(color: _getStatusColor(referral.status))), // Status badge
                        Text('Created: ${_formatDate(referral.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9))), // Date formatting
                        if (referral.paidAt != null)
                          Text('Paid: ${_formatDate(referral.paidAt!)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                              onPressed: () {
                                _showEditReferralDialog(referral);
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () {
                                _showDeleteConfirmationDialog(referral.id);
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
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateReferralDialog();
        },
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)), // White icon
      ),
    );
  }
}
