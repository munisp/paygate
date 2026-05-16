import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Dark theme colors
const Color kBackgroundColor = Color(0xFF0f172a);
const Color kCardColor = Color(0xFF1e293b);
const Color kTextColor = Color(0xFFf1f5f9);
const Color kAccentColor = Color(0xFF6366f1);

// Define a provider for the billing data
final tenantBillingProvider = FutureProvider.autoDispose.family<List<dynamic>, String>((ref, searchQuery) async {
  final api = ref.read(apiServiceProvider);
  // Assuming the tRPC router namespace for TenantBillingDashboard is 'tenantBilling.list'
  final response = await api.get('/trpc/tenantBilling.list', params: {'search': searchQuery});
  return response.data as List<dynamic>;
});

class TenantBillingDashboardScreen extends ConsumerStatefulWidget {
  const TenantBillingDashboardScreen({super.key});

  @override
  ConsumerState<TenantBillingDashboardScreen> createState() => _TenantBillingDashboardScreenState();
}

class _TenantBillingDashboardScreenState extends ConsumerState<TenantBillingDashboardScreen> {
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

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

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$', decimalDigits: 2);
    return format.format(amount);
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'paid':
        color = Colors.green;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      case 'overdue':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
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

  Future<void> _createInvoice() async {
    // Placeholder for create invoice logic and API call
    print('Create Invoice');
    // Example: show a dialog for input
    await showDialog(context: context, builder: (context) => AlertDialog(
      title: const Text('Create Invoice', style: TextStyle(color: kTextColor)),
      backgroundColor: kCardColor,
      content: const Text('Form for new invoice goes here.', style: TextStyle(color: kTextColor)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel', style: TextStyle(color: kAccentColor))),
        TextButton(onPressed: () {
          // Call API to create invoice
          // ref.read(apiServiceProvider).post('/trpc/tenantBilling.create', body: {...});
          Navigator.pop(context);
          ref.invalidate(tenantBillingProvider);
        }, child: const Text('Create', style: TextStyle(color: kAccentColor))),
      ],
    ));
  }

  Future<void> _editInvoice(Map<String, dynamic> invoice) async {
    // Placeholder for edit invoice logic and API call
    print('Edit Invoice: ${invoice['invoiceId']}');
    await showDialog(context: context, builder: (context) => AlertDialog(
      title: Text('Edit Invoice ${invoice['invoiceId']}', style: TextStyle(color: kTextColor)),
      backgroundColor: kCardColor,
      content: const Text('Form for editing invoice goes here.', style: TextStyle(color: kTextColor)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel', style: TextStyle(color: kAccentColor))),
        TextButton(onPressed: () {
          // Call API to update invoice
          // ref.read(apiServiceProvider).post('/trpc/tenantBilling.update', body: {...});
          Navigator.pop(context);
          ref.invalidate(tenantBillingProvider);
        }, child: const Text('Save', style: TextStyle(color: kAccentColor))),
      ],
    ));
  }

  Future<void> _deleteInvoice(String invoiceId) async {
    // Placeholder for delete invoice logic and API call
    print('Delete Invoice: $invoiceId');
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Confirm Delete', style: TextStyle(color: kTextColor)),
      backgroundColor: kCardColor,
      content: Text('Are you sure you want to delete invoice $invoiceId?', style: TextStyle(color: kTextColor)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel', style: TextStyle(color: kAccentColor))),
        TextButton(onPressed: () {
          // Call API to delete invoice
          // ref.read(apiServiceProvider).post('/trpc/tenantBilling.delete', body: {'invoiceId': invoiceId});
          Navigator.pop(context, true);
          ref.invalidate(tenantBillingProvider);
        }, child: const Text('Delete', style: TextStyle(color: Colors.redAccent))),
      ],
    ));
    if (confirm == true) {
      // Perform deletion
    }
  }

  @override
  Widget build(BuildContext context) {
    final billingDataAsyncValue = ref.watch(tenantBillingProvider(_searchQuery));

    return Scaffold(
      backgroundColor: kBackgroundColor,
      appBar: AppBar(
        title: const Text('Tenant Billing Dashboard', style: TextStyle(color: kTextColor)),
        backgroundColor: kCardColor,
        iconTheme: const IconThemeData(color: kTextColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.search, color: kTextColor),
            onPressed: () {
              showDialog(context: context, builder: (context) => AlertDialog(
                title: const Text('Search Invoices', style: TextStyle(color: kTextColor)),
                backgroundColor: kCardColor,
                content: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by Invoice ID or Status',
                    hintStyle: TextStyle(color: kTextColor.withOpacity(0.7)),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: kAccentColor)),
                  ),
                  style: const TextStyle(color: kTextColor),
                ),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close', style: TextStyle(color: kAccentColor))),
                ],
              ));
            },
          ),
          IconButton(
            icon: const Icon(Icons.add, color: kTextColor),
            onPressed: _createInvoice,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(tenantBillingProvider(_searchQuery).future),
        child: billingDataAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: kAccentColor)),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: kTextColor)),
          ),
          data: (data) {
            if (data.isEmpty) {
              return const Center(
                child: Text('No billing data available.', style: TextStyle(color: kTextColor)),
              );
            }
            return ListView.builder(
              itemCount: data.length,
              itemBuilder: (context, index) {
                final item = data[index];
                final amount = (item['amount'] as num).toDouble();
                final currency = item['currency'] as String;
                final status = item['status'] as String;
                final date = DateTime.parse(item['date'] as String);
                final formattedDate = DateFormat('MMM dd, yyyy').format(date);

                return Card(
                  color: kCardColor,
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Invoice ID: ${item['invoiceId']}', style: const TextStyle(color: kTextColor, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Amount: ${_formatAmount(amount, currency)}', style: const TextStyle(color: kTextColor)),
                            _buildStatusBadge(status),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('Date: $formattedDate', style: const TextStyle(color: kTextColor)),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => _editInvoice(item),
                              child: const Text('View/Edit', style: TextStyle(color: kAccentColor)),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => _deleteInvoice(item['invoiceId'] as String),
                              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
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
    );
  }
}
