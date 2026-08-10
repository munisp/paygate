import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define dark theme colors
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);
const Color _successColor = Color(0xFF22c55e);
const Color _warningColor = Color(0xFFeab308);
const Color _dangerColor = Color(0xFFef4444);

// Dummy data for demonstration
class DisputeEscalation {
  final String id;
  final String merchantName;
  final double amount;
  final String currency;
  final String status;
  final DateTime date;
  final String description;

  DisputeEscalation({
    required this.id,
    required this.merchantName,
    required this.amount,
    required this.currency,
    required this.status,
    required this.date,
    required this.description,
  });

  factory DisputeEscalation.fromJson(Map<String, dynamic> json) {
    return DisputeEscalation(
      id: json['id'],
      merchantName: json['merchantName'],
      amount: json['amount'].toDouble(),
      currency: json['currency'],
      status: json['status'],
      date: DateTime.parse(json['date']),
      description: json['description'] ?? 'No description provided',
    );
  }
}

// Provider for fetching dispute escalations
final disputeEscalationsProvider = FutureProvider.autoDispose<List<DisputeEscalation>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    // Simulate API call
    // final response = await api.get('/trpc/disputeEscalation.list', params: {});
    // return (response.data as List).map((e) => DisputeEscalation.fromJson(e)).toList();

    // Dummy data for now
    await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
    return [
      DisputeEscalation(id: 'DE001', merchantName: 'Shop A', amount: 15000.00, currency: 'NGN', status: 'Pending', date: DateTime(2023, 10, 26), description: 'Customer claims unauthorized transaction.'),
      DisputeEscalation(id: 'DE002', merchantName: 'Store B', amount: 250.50, currency: 'USD', status: 'Resolved', date: DateTime(2023, 10, 25), description: 'Dispute resolved in favor of merchant.'),
      DisputeEscalation(id: 'DE003', merchantName: 'Vendor C', amount: 5000.00, currency: 'NGN', status: 'Escalated', date: DateTime(2023, 10, 24), description: 'Merchant and customer unable to agree.'),
      DisputeEscalation(id: 'DE004', merchantName: 'Tech Solutions', amount: 1200.00, currency: 'USD', status: 'Pending', date: DateTime(2023, 10, 23), description: 'Service not delivered as promised.'),
      DisputeEscalation(id: 'DE005', merchantName: 'Fashion Hub', amount: 8000.00, currency: 'NGN', status: 'Resolved', date: DateTime(2023, 10, 22), description: 'Item returned, refund processed.'),
    ];
  } catch (e) {
    throw Exception('Failed to load dispute escalations: $e');
  }
});

// State provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// State provider for filter status
final filterStatusProvider = StateProvider<String?>((ref) => null);

// Filtered dispute escalations provider
final filteredDisputeEscalationsProvider = Provider.autoDispose<List<DisputeEscalation>>((ref) {
  final escalations = ref.watch(disputeEscalationsProvider).valueOrNull ?? [];
  final searchQuery = ref.watch(searchQueryProvider).toLowerCase();
  final filterStatus = ref.watch(filterStatusProvider);

  return escalations.where((escalation) {
    final matchesSearch = escalation.merchantName.toLowerCase().contains(searchQuery) ||
        escalation.id.toLowerCase().contains(searchQuery) ||
        escalation.description.toLowerCase().contains(searchQuery);
    final matchesStatus = filterStatus == null || escalation.status == filterStatus;
    return matchesSearch && matchesStatus;
  }).toList();
});

class DisputeEscalationScreen extends ConsumerStatefulWidget {
  const DisputeEscalationScreen({super.key});

  @override
  ConsumerState<DisputeEscalationScreen> createState() => _DisputeEscalationScreenState();
}

class _DisputeEscalationScreenState extends ConsumerState<DisputeEscalationScreen> {
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

  Color _getStatusColor(String status) {
    switch (status) {
      case 'Pending':
        return _warningColor;
      case 'Resolved':
        return _successColor;
      case 'Escalated':
        return _dangerColor;
      default:
        return _textColor;
    }
  }

  String _formatCurrency(double amount, String currency) {
    final String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or Dollar sign
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  void _showDisputeDetails(DisputeEscalation escalation) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Dispute Details: ${escalation.id}', style: const TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('Merchant: ${escalation.merchantName}', style: const TextStyle(color: _textColor)),
                Text('Amount: ${_formatCurrency(escalation.amount, escalation.currency)}', style: const TextStyle(color: _textColor)),
                Text('Status: ${escalation.status}', style: TextStyle(color: _getStatusColor(escalation.status))),
                Text('Date: ${_formatDate(escalation.date)}', style: const TextStyle(color: _textColor)),
                const SizedBox(height: 10),
                Text('Description: ${escalation.description}', style: const TextStyle(color: _textColor)),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Close', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  void _resolveDispute(DisputeEscalation escalation) {
    // Implement API call to resolve dispute
    // ref.read(apiServiceProvider).post('/trpc/disputeEscalation.resolve', body: {'id': escalation.id});
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Resolving dispute ${escalation.id}...', style: const TextStyle(color: _textColor)), backgroundColor: _successColor),
    );
    ref.invalidate(disputeEscalationsProvider); // Refresh list after action
  }

  void _escalateDispute(DisputeEscalation escalation) {
    // Implement API call to escalate dispute further
    // ref.read(apiServiceProvider).post('/trpc/disputeEscalation.escalate', body: {'id': escalation.id});
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Escalating dispute ${escalation.id}...', style: const TextStyle(color: _textColor)), backgroundColor: _dangerColor),
    );
    ref.invalidate(disputeEscalationsProvider); // Refresh list after action
  }

  @override
  Widget build(BuildContext context) {
    final filteredEscalationsAsyncValue = ref.watch(filteredDisputeEscalationsProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Dispute Escalations', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list, color: _textColor),
            onSelected: (String? newValue) {
              ref.read(filterStatusProvider.notifier).state = newValue == 'All' ? null : newValue;
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'All',
                child: Text('All', style: TextStyle(color: _textColor)),
              ),
              const PopupMenuItem<String>(
                value: 'Pending',
                child: Text('Pending', style: TextStyle(color: _textColor)),
              ),
              const PopupMenuItem<String>(
                value: 'Resolved',
                child: Text('Resolved', style: TextStyle(color: _textColor)),
              ),
              const PopupMenuItem<String>(
                value: 'Escalated',
                child: Text('Escalated', style: TextStyle(color: _textColor)),
              ),
            ],
            color: _cardColor,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by merchant, ID, or description...',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(disputeEscalationsProvider.future),
              child: filteredEscalationsAsyncValue.when(
                data: (escalations) {
                  if (escalations.isEmpty) {
                    return Center(
                      child: Text(
                        filterStatus != null || _searchController.text.isNotEmpty
                            ? 'No matching dispute escalations found.'
                            : 'No dispute escalations found.',
                        style: const TextStyle(color: _textColor, fontSize: 18),
                      ),
                    );
                  }
                  return ListView.builder(
                    itemCount: escalations.length,
                    itemBuilder: (context, index) {
                      final escalation = escalations[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ExpansionTile(
                          collapsedIconColor: _textColor,
                          iconColor: _textColor,
                          title: Text(
                            '${escalation.merchantName} - ${_formatCurrency(escalation.amount, escalation.currency)}',
                            style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('ID: ${escalation.id}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                              Row(
                                children: [
                                  Text('Status: ', style: TextStyle(color: _textColor.withOpacity(0.8))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _getStatusColor(escalation.status),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      escalation.status,
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                              Text('Date: ${_formatDate(escalation.date)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                            ],
                          ),
                          children: <Widget>[
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Description: ${escalation.description}', style: const TextStyle(color: _textColor)),
                                  const SizedBox(height: 10),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (escalation.status == 'Pending' || escalation.status == 'Escalated')
                                        TextButton(
                                          onPressed: () => _resolveDispute(escalation),
                                          child: const Text('Resolve', style: TextStyle(color: _successColor)),
                                        ),
                                      const SizedBox(width: 8),
                                      if (escalation.status == 'Pending')
                                        TextButton(
                                          onPressed: () => _escalateDispute(escalation),
                                          child: const Text('Escalate', style: TextStyle(color: _dangerColor)),
                                        ),
                                      const SizedBox(width: 8),
                                      TextButton(
                                        onPressed: () => _showDisputeDetails(escalation),
                                        child: const Text('View Details', style: TextStyle(color: _accentColor)),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (error, stack) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      'Error: ${error.toString()}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: _dangerColor, fontSize: 18),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
