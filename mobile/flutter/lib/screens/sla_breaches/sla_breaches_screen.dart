import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

// Define a simple data model for SLA Breach
class SlaBreach {
  final String id;
  final String merchantName;
  final String serviceType;
  final DateTime breachDate;
  final String status;
  final double penaltyAmount;
  final String currency;

  SlaBreach({
    required this.id,
    required this.merchantName,
    required this.serviceType,
    required this.breachDate,
    required this.status,
    required this.penaltyAmount,
    required this.currency,
  });

  factory SlaBreach.fromJson(Map<String, dynamic> json) {
    return SlaBreach(
      id: json['id'],
      merchantName: json['merchantName'],
      serviceType: json['serviceType'],
      breachDate: DateTime.parse(json['breachDate']),
      status: json['status'],
      penaltyAmount: json['penaltyAmount'].toDouble(),
      currency: json['currency'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'merchantName': merchantName,
        'serviceType': serviceType,
        'breachDate': breachDate.toIso8601String(),
        'status': status,
        'penaltyAmount': penaltyAmount,
        'currency': currency,
      };
}

// Provider for fetching SLA Breaches
final slaBreachesProvider = FutureProvider.family<List<SlaBreach>, String>((ref, query) async {
  final apiService = ref.read(apiServiceProvider);
  final response = await apiService.get('/trpc/slaBreaches.list', params: {'query': query});
  // Simulate API delay
  await Future.delayed(const Duration(milliseconds: 500));
  if (response.statusCode == 200) {
    // Assuming response.data is a List<Map<String, dynamic>>
    final List<dynamic> data = response.data['slaBreaches'];
    return data.map((json) => SlaBreach.fromJson(json)).toList();
  } else {
    throw Exception('Failed to load SLA breaches');
  }
});

// Provider for managing search query
final searchQueryProvider = StateProvider<String>((ref) => '');

class SlaBreachesScreen extends ConsumerStatefulWidget {
  const SlaBreachesScreen({super.key});

  @override
  ConsumerState<SlaBreachesScreen> createState() => _SlaBreachesScreenState();
}

class _SlaBreachesScreenState extends ConsumerState<SlaBreachesScreen> {
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

  Future<void> _refreshSlaBreaches() async {
    ref.invalidate(slaBreachesProvider);
  }

  void _showCreateEditDialog({SlaBreach? breach}) {
    final isEditing = breach != null;
    final TextEditingController merchantNameController = TextEditingController(text: breach?.merchantName);
    final TextEditingController serviceTypeController = TextEditingController(text: breach?.serviceType);
    final TextEditingController penaltyAmountController = TextEditingController(text: breach?.penaltyAmount.toString());
    String? selectedStatus = breach?.status;
    String? selectedCurrency = breach?.currency;

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card color
          title: Text(isEditing ? 'Edit SLA Breach' : 'Create SLA Breach', style: const TextStyle(color: Color(0xFFf1f5f9))), // Text color
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: merchantNameController,
                  decoration: const InputDecoration(
                    labelText: 'Merchant Name',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: serviceTypeController,
                  decoration: const InputDecoration(
                    labelText: 'Service Type',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: penaltyAmountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Penalty Amount',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  dropdownColor: const Color(0xFF1e293b),
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['Open', 'Closed', 'Pending']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: const TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedStatus = newValue;
                  },
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedCurrency,
                  dropdownColor: const Color(0xFF1e293b),
                  decoration: const InputDecoration(
                    labelText: 'Currency',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  items: <String>['₦', '$']
                      .map<DropdownMenuItem<String>>((String value) {
                    return DropdownMenuItem<String>(
                      value: value,
                      child: Text(value, style: const TextStyle(color: Color(0xFFf1f5f9))),
                    );
                  }).toList(),
                  onChanged: (String? newValue) {
                    selectedCurrency = newValue;
                  },
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
            ),
            ElevatedButton(
              onPressed: () async {
                final newBreach = SlaBreach(
                  id: isEditing ? breach!.id : UniqueKey().toString(),
                  merchantName: merchantNameController.text,
                  serviceType: serviceTypeController.text,
                  breachDate: breach?.breachDate ?? DateTime.now(), // Keep original date or set new
                  status: selectedStatus ?? 'Open',
                  penaltyAmount: double.tryParse(penaltyAmountController.text) ?? 0.0,
                  currency: selectedCurrency ?? '$',
                );

                try {
                  if (isEditing) {
                    await ref.read(apiServiceProvider).post('/trpc/slaBreaches.update', body: newBreach.toJson());
                  } else {
                    await ref.read(apiServiceProvider).post('/trpc/slaBreaches.create', body: newBreach.toJson());
                  }
                  _refreshSlaBreaches();
                  Navigator.of(context).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to ${isEditing ? 'update' : 'create'} SLA breach: $e')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366f1)), // Accent color
              child: Text(isEditing ? 'Save' : 'Create', style: const TextStyle(color: Color(0xFFf1f5f9))), // Text color
            ),
          ],
        );
      },
    );
  }

  void _confirmDelete(SlaBreach breach) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b), // Card color
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
          content: Text('Are you sure you want to delete the SLA breach for ${breach.merchantName}?', style: const TextStyle(color: Color(0xFFf1f5f9))), // Text color
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
            ),
            ElevatedButton(
              onPressed: () async {
                try {
                  await ref.read(apiServiceProvider).post('/trpc/slaBreaches.delete', body: {'id': breach.id});
                  _refreshSlaBreaches();
                  Navigator.of(context).pop();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete SLA breach: $e')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red), // Use a distinct color for delete
              child: const Text('Delete', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
            ),
          ],
        );
      },
    );
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency, decimalDigits: 2);
    return format.format(amount);
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'Open':
        color = Colors.red.shade700;
        break;
      case 'Pending':
        color = Colors.orange.shade700;
        break;
      case 'Closed':
        color = Colors.green.shade700;
        break;
      default:
        color = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final searchQuery = ref.watch(searchQueryProvider);
    final slaBreachesAsyncValue = ref.watch(slaBreachesProvider(searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Background color
      appBar: AppBar(
        title: const Text('SLA Breaches', style: TextStyle(color: Color(0xFFf1f5f9))), // Text color
        backgroundColor: const Color(0xFF1e293b), // Card color
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Text color for icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by merchant name or service type...',
                hintStyle: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF0f172a), // Background color for search field
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshSlaBreaches,
        color: const Color(0xFF6366f1), // Accent color for refresh indicator
        child: slaBreachesAsyncValue.when(
          data: (breaches) {
            if (breaches.isEmpty) {
              return const Center(
                child: Text(
                  'No SLA breaches found.',
                  style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 18), // Text color
                ),
              );
            }
            return ListView.builder(
              itemCount: breaches.length,
              itemBuilder: (context, index) {
                final breach = breaches[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card color
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          breach.merchantName,
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFf1f5f9)), // Text color
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Service Type: ${breach.serviceType}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)), // Text color
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Breach Date: ${DateFormat('yyyy-MM-dd – kk:mm').format(breach.breachDate)}',
                          style: const TextStyle(color: Color(0xFFf1f5f9)), // Text color
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Penalty: ${_formatAmount(breach.penaltyAmount, breach.currency)}',
                              style: const TextStyle(color: Color(0xFFf1f5f9)), // Text color
                            ),
                            _buildStatusBadge(breach.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color
                              onPressed: () => _showCreateEditDialog(breach: breach),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.red), // Distinct color for delete
                              onPressed: () => _confirmDelete(breach),
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
            child: Text('Error: $err', style: const TextStyle(color: Colors.red, fontSize: 16)), // Error text color
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFF6366f1), // Accent color
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)), // Text color
      ),
    );
  }
}
