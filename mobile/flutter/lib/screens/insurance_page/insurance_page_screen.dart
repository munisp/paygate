import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the tRPC router namespace for InsurancePage
// Assuming a router like 'insurance.list', 'insurance.get', 'insurance.create', 'insurance.update', 'insurance.delete'
// This is a placeholder and should be adjusted based on the actual tRPC router definition.

// Data models (simplified for example)
class InsurancePolicy {
  final String id;
  final String policyNumber;
  final String customerName;
  final double amount;
  final DateTime startDate;
  final DateTime endDate;
  final String status;

  InsurancePolicy({
    required this.id,
    required this.policyNumber,
    required this.customerName,
    required this amount,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory InsurancePolicy.fromJson(Map<String, dynamic> json) {
    return InsurancePolicy(
      id: json['id'] as String,
      policyNumber: json['policyNumber'] as String,
      customerName: json['customerName'] as String,
      amount: (json['amount'] as num).toDouble(),
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      status: json['status'] as String,
    );
  }
}

// Riverpod provider for fetching insurance policies
final insurancePoliciesProvider = FutureProvider.family<List<InsurancePolicy>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/insurance.list', params: {'query': query});
    final List<dynamic> data = response['policies'] as List<dynamic>;
    return data.map((e) => InsurancePolicy.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    throw Exception('Failed to load insurance policies: $e');
  }
});

class InsurancePageScreen extends ConsumerStatefulWidget {
  const InsurancePageScreen({super.key});

  @override
  ConsumerState<InsurancePageScreen> createState() => _InsurancePageScreenState();
}

class _InsurancePageScreenState extends ConsumerState<InsurancePageScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

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

  Future<void> _refreshPolicies() async {
    ref.invalidate(insurancePoliciesProvider(_searchQuery));
  }

  void _showCreatePolicyDialog() {
    showDialog(
      context: context,
      builder: (context) => _CreateEditPolicyDialog(
        onSave: (policyData) async {
          final api = ref.read(apiServiceProvider);
          try {
            await api.post('/trpc/insurance.create', body: policyData);
            _refreshPolicies();
            if (context.mounted) Navigator.of(context).pop();
          } catch (e) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Failed to create policy: $e')),
              );
            }
          }
        },
      ),
    );
  }

  void _showEditPolicyDialog(InsurancePolicy policy) {
    showDialog(
      context: context,
      builder: (context) => _CreateEditPolicyDialog(
        policy: policy,
        onSave: (policyData) async {
          final api = ref.read(apiServiceProvider);
          try {
            await api.post('/trpc/insurance.update', body: {...policyData, 'id': policy.id});
            _refreshPolicies();
            if (context.mounted) Navigator.of(context).pop();
          } catch (e) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Failed to update policy: $e')),
              );
            }
          }
        },
      ),
    );
  }

  void _showDeleteConfirmationDialog(String policyId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Policy'),
        content: const Text('Are you sure you want to delete this policy?'),
        backgroundColor: const Color(0xFF1e293b),
        titleTextStyle: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 20),
        contentTextStyle: const TextStyle(color: Color(0xFFf1f5f9)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))), 
          ),
          TextButton(
            onPressed: () async {
              final api = ref.read(apiServiceProvider);
              try {
                await api.post('/trpc/insurance.delete', body: {'id': policyId});
                _refreshPolicies();
                if (context.mounted) Navigator.of(context).pop();
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete policy: $e')),
                  );
                }
              }
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final policiesAsyncValue = ref.watch(insurancePoliciesProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('Insurance Policies', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
            onPressed: _showCreatePolicyDialog,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshPolicies,
        color: const Color(0xFF6366f1),
        child: Column(
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
                  fillColor: const Color(0xFF1e293b),
                ),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
              ),
            ),
            Expanded(
              child: policiesAsyncValue.when(
                data: (policies) {
                  if (policies.isEmpty) {
                    return const Center(
                      child: Text(
                        'No insurance policies found.',
                        style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: policies.length,
                    itemBuilder: (context, index) {
                      final policy = policies[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b),
                        child: ListTile(
                          title: Text(policy.policyNumber, style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Customer: ${policy.customerName}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Amount: ₦${policy.amount.toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              Text('Period: ${policy.startDate.toLocal().toString().split(' ')[0]} - ${policy.endDate.toLocal().toString().split(' ')[0]}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8))),
                              _buildStatusBadge(policy.status),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: Color(0xFF6366f1)),
                                onPressed: () => _showEditPolicyDialog(policy),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(policy.id),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), 
                error: (err, stack) => Center(
                  child: Text(
                    'Error: ${err.toString()}',
                    style: const TextStyle(color: Colors.red, fontSize: 16),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'expired':
        badgeColor = Colors.red;
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
      child: Text(
        status.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _CreateEditPolicyDialog extends ConsumerStatefulWidget {
  final InsurancePolicy? policy;
  final Function(Map<String, dynamic>) onSave;

  const _CreateEditPolicyDialog({super.key, this.policy, required this.onSave});

  @override
  ConsumerState<_CreateEditPolicyDialog> createState() => _CreateEditPolicyDialogState();
}

class _CreateEditPolicyDialogState extends ConsumerState<_CreateEditPolicyDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _policyNumberController;
  late TextEditingController _customerNameController;
  late TextEditingController _amountController;
  late TextEditingController _startDateController;
  late TextEditingController _endDateController;
  String? _selectedStatus;

  @override
  void initState() {
    super.initState();
    _policyNumberController = TextEditingController(text: widget.policy?.policyNumber);
    _customerNameController = TextEditingController(text: widget.policy?.customerName);
    _amountController = TextEditingController(text: widget.policy?.amount.toStringAsFixed(2));
    _startDateController = TextEditingController(text: widget.policy?.startDate.toLocal().toString().split(' ')[0]);
    _endDateController = TextEditingController(text: widget.policy?.endDate.toLocal().toString().split(' ')[0]);
    _selectedStatus = widget.policy?.status;
  }

  @override
  void dispose() {
    _policyNumberController.dispose();
    _customerNameController.dispose();
    _amountController.dispose();
    _startDateController.dispose();
    _endDateController.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context, TextEditingController controller) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(controller.text) ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2101),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: Color(0xFF6366f1), // header background color
              onPrimary: Colors.white, // header text color
              surface: Color(0xFF1e293b), // calendar background color
              onSurface: Color(0xFFf1f5f9), // calendar text color
            ),
            textButtonTheme: TextButtonThemeData(
              style: TextButton.styleFrom(foregroundColor: const Color(0xFF6366f1)),
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      controller.text = picked.toLocal().toString().split(' ')[0];
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1e293b),
      title: Text(widget.policy == null ? 'Create Policy' : 'Edit Policy', style: const TextStyle(color: Color(0xFFf1f5f9))),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildTextField(_policyNumberController, 'Policy Number', validator: (value) => value!.isEmpty ? 'Required' : null),
              _buildTextField(_customerNameController, 'Customer Name', validator: (value) => value!.isEmpty ? 'Required' : null),
              _buildTextField(_amountController, 'Amount', keyboardType: TextInputType.number, validator: (value) => value!.isEmpty ? 'Required' : null),
              _buildDateField(_startDateController, 'Start Date', () => _selectDate(context, _startDateController)),
              _buildDateField(_endDateController, 'End Date', () => _selectDate(context, _endDateController)),
              DropdownButtonFormField<String>(
                value: _selectedStatus,
                decoration: _inputDecoration('Status'),
                dropdownColor: const Color(0xFF1e293b),
                style: const TextStyle(color: Color(0xFFf1f5f9)),
                items: ['Active', 'Pending', 'Expired', 'Cancelled'].map((String status) {
                  return DropdownMenuItem<String>(
                    value: status,
                    child: Text(status),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  setState(() {
                    _selectedStatus = newValue;
                  });
                },
                validator: (value) => value == null ? 'Required' : null,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))), 
        ),
        TextButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              widget.onSave({
                'policyNumber': _policyNumberController.text,
                'customerName': _customerNameController.text,
                'amount': double.parse(_amountController.text),
                'startDate': _startDateController.text,
                'endDate': _endDateController.text,
                'status': _selectedStatus,
              });
            }
          },
          child: Text(widget.policy == null ? 'Create' : 'Save', style: const TextStyle(color: Color(0xFF6366f1))), 
        ),
      ],
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, {TextInputType keyboardType = TextInputType.text, String? Function(String?)? validator}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        style: const TextStyle(color: Color(0xFFf1f5f9)),
        decoration: _inputDecoration(label),
        validator: validator,
      ),
    );
  }

  Widget _buildDateField(TextEditingController controller, String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: TextFormField(
        controller: controller,
        readOnly: true,
        style: const TextStyle(color: Color(0xFFf1f5f9)),
        decoration: _inputDecoration(label).copyWith(
          suffixIcon: const Icon(Icons.calendar_today, color: Color(0xFFf1f5f9)),
        ),
        onTap: onTap,
        validator: (value) => value!.isEmpty ? 'Required' : null,
      ),
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.8)),
      filled: true,
      fillColor: const Color(0xFF0f172a),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: const BorderSide(color: Color(0xFF6366f1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8.0),
        borderSide: BorderSide.none,
      ),
    );
  }
}
