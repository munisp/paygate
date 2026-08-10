import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date formatting

// Data Model for a Subscription
class Subscription {
  final String id;
  final String customerName;
  final String planName;
  final double amount;
  final String currency;
  final DateTime startDate;
  final DateTime? endDate;
  final String status;

  Subscription({
    required this.id,
    required this.customerName,
    required this.planName,
    required this.amount,
    required this.currency,
    required this.startDate,
    this.endDate,
    required this.status,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) {
    return Subscription(
      id: json['id'],
      customerName: json['customerName'],
      planName: json['planName'],
      amount: json['amount'].toDouble(),
      currency: json['currency'],
      startDate: DateTime.parse(json['startDate']),
      endDate: json['endDate'] != null ? DateTime.parse(json['endDate']) : null,
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerName': customerName,
        'planName': planName,
        'amount': amount,
        'currency': currency,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate?.toIso8601String(),
        'status': status,
      };

  Subscription copyWith({
    String? id,
    String? customerName,
    String? planName,
    double? amount,
    String? currency,
    DateTime? startDate,
    DateTime? endDate,
    String? status,
  }) {
    return Subscription(
      id: id ?? this.id,
      customerName: customerName ?? this.customerName,
      planName: planName ?? this.planName,
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      status: status ?? this.status,
    );
  }
}

// State providers for search and filter
final searchQueryProvider = StateProvider<String>((ref) => '');
final filterStatusProvider = StateProvider<String?>((ref) => null); // e.g., 'Active', 'Expired', 'Pending'

// Mock data store for CRUD operations
final _mockSubscriptions = <Subscription>[
  Subscription(
    id: 'sub_001',
    customerName: 'John Doe',
    planName: 'Premium Monthly',
    amount: 1500.00,
    currency: '₦',
    startDate: DateTime(2023, 1, 1),
    endDate: null,
    status: 'Active',
  ),
  Subscription(
    id: 'sub_002',
    customerName: 'Jane Smith',
    planName: 'Basic Yearly',
    amount: 120.00,
    currency: '$',
    startDate: DateTime(2022, 6, 15),
    endDate: DateTime(2023, 6, 14),
    status: 'Expired',
  ),
  Subscription(
    id: 'sub_003',
    customerName: 'Peter Jones',
    planName: 'Enterprise',
    amount: 5000.00,
    currency: '₦',
    startDate: DateTime(2024, 3, 10),
    endDate: null,
    status: 'Pending',
  ),
  Subscription(
    id: 'sub_004',
    customerName: 'Alice Wonderland',
    planName: 'Standard',
    amount: 50.00,
    currency: '$',
    startDate: DateTime(2024, 1, 1),
    endDate: null,
    status: 'Active',
  ),
];

// Riverpod provider for fetching and filtering subscriptions
final subscriptionsProvider = FutureProvider.autoDispose<List<Subscription>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);
  final filterStatus = ref.watch(filterStatusProvider);

  // Simulate API call
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay

  // Simulate tRPC router namespace: subscriptionBillingV2.list
  // In a real scenario, searchQuery and filterStatus would be passed as params to the API
  // final response = await api.get('/trpc/subscriptionBillingV2.list', params: {'search': searchQuery, 'status': filterStatus});
  // For now, we'll filter the mock data locally.

  List<Subscription> filteredSubscriptions = _mockSubscriptions.where((sub) {
    final matchesSearch = searchQuery.isEmpty ||
        sub.customerName.toLowerCase().contains(searchQuery.toLowerCase()) ||
        sub.planName.toLowerCase().contains(searchQuery.toLowerCase());
    final matchesStatus = filterStatus == null || sub.status == filterStatus;
    return matchesSearch && matchesStatus;
  }).toList();

  return filteredSubscriptions;
});

// Provider for creating a subscription
final createSubscriptionProvider = FutureProvider.family.autoDispose<void, Subscription>((ref, newSubscription) async {
  final api = ref.read(apiServiceProvider);
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  // Simulate tRPC router namespace: subscriptionBillingV2.create
  // await api.post('/trpc/subscriptionBillingV2.create', body: newSubscription.toJson());
  _mockSubscriptions.add(newSubscription.copyWith(id: 'sub_${(_mockSubscriptions.length + 1).toString().padLeft(3, '0')}'));
  ref.invalidate(subscriptionsProvider);
});

// Provider for updating a subscription
final updateSubscriptionProvider = FutureProvider.family.autoDispose<void, Subscription>((ref, updatedSubscription) async {
  final api = ref.read(apiServiceProvider);
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  // Simulate tRPC router namespace: subscriptionBillingV2.update
  // await api.post('/trpc/subscriptionBillingV2.update', body: updatedSubscription.toJson());
  final index = _mockSubscriptions.indexWhere((sub) => sub.id == updatedSubscription.id);
  if (index != -1) {
    _mockSubscriptions[index] = updatedSubscription;
  }
  ref.invalidate(subscriptionsProvider);
});

// Provider for deleting a subscription
final deleteSubscriptionProvider = FutureProvider.family.autoDispose<void, String>((ref, subscriptionId) async {
  final api = ref.read(apiServiceProvider);
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  // Simulate tRPC router namespace: subscriptionBillingV2.delete
  // await api.post('/trpc/subscriptionBillingV2.delete', body: {'id': subscriptionId});
  _mockSubscriptions.removeWhere((sub) => sub.id == subscriptionId);
  ref.invalidate(subscriptionsProvider);
});

class SubscriptionBillingV2Screen extends ConsumerStatefulWidget {
  const SubscriptionBillingV2Screen({super.key});

  @override
  ConsumerState<SubscriptionBillingV2Screen> createState() => _SubscriptionBillingV2ScreenState();
}

class _SubscriptionBillingV2ScreenState extends ConsumerState<SubscriptionBillingV2Screen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

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
      case 'Active':
        return Colors.green;
      case 'Expired':
        return Colors.red;
      case 'Pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency, decimalDigits: 2);
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM d, yyyy').format(date);
  }

  Future<void> _showSubscriptionDialog({Subscription? subscription}) async {
    final isEditing = subscription != null;
    final customerNameController = TextEditingController(text: subscription?.customerName);
    final planNameController = TextEditingController(text: subscription?.planName);
    final amountController = TextEditingController(text: subscription?.amount.toString());
    final currencyController = TextEditingController(text: subscription?.currency);
    final statusController = TextEditingController(text: subscription?.status);
    DateTime? selectedStartDate = subscription?.startDate;
    DateTime? selectedEndDate = subscription?.endDate;

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Subscription' : 'Create Subscription', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: customerNameController,
                decoration: InputDecoration(
                  labelText: 'Customer Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              TextField(
                controller: planNameController,
                decoration: InputDecoration(
                  labelText: 'Plan Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              TextField(
                controller: currencyController,
                decoration: InputDecoration(
                  labelText: 'Currency (₦ or $)',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              TextField(
                controller: statusController,
                decoration: InputDecoration(
                  labelText: 'Status (Active, Expired, Pending)',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              ListTile(
                title: Text('Start Date: ${selectedStartDate != null ? _formatDate(selectedStartDate) : 'Select Date'}', style: TextStyle(color: _textColor)),
                trailing: Icon(Icons.calendar_today, color: _accentColor),
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: selectedStartDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: _accentColor, // header background color
                            onPrimary: _textColor, // header text color
                            onSurface: _textColor, // body text color
                            surface: _cardColor, // dialog background color
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(foregroundColor: _accentColor), // button text color
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null && picked != selectedStartDate) {
                    setState(() {
                      selectedStartDate = picked;
                    });
                  }
                },
              ),
              ListTile(
                title: Text('End Date: ${selectedEndDate != null ? _formatDate(selectedEndDate) : 'Select Date (Optional)'}', style: TextStyle(color: _textColor)),
                trailing: Icon(Icons.calendar_today, color: _accentColor),
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: selectedEndDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: _accentColor, // header background color
                            onPrimary: _textColor, // header text color
                            onSurface: _textColor, // body text color
                            surface: _cardColor, // dialog background color
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(foregroundColor: _accentColor), // button text color
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null && picked != selectedEndDate) {
                    setState(() {
                      selectedEndDate = picked;
                    });
                  }
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () {
              final newSubscription = Subscription(
                id: isEditing ? subscription!.id : 'temp_id_${DateTime.now().millisecondsSinceEpoch}',
                customerName: customerNameController.text,
                planName: planNameController.text,
                amount: double.tryParse(amountController.text) ?? 0.0,
                currency: currencyController.text.isEmpty ? '$' : currencyController.text,
                startDate: selectedStartDate ?? DateTime.now(),
                endDate: selectedEndDate,
                status: statusController.text.isEmpty ? 'Active' : statusController.text,
              );
              if (isEditing) {
                ref.read(updateSubscriptionProvider(newSubscription));
              } else {
                ref.read(createSubscriptionProvider(newSubscription));
              }
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor, foregroundColor: _textColor),
            child: Text(isEditing ? 'Save' : 'Create'),
          ),
        ],
      );
    });
  }

  Future<void> _confirmDelete(String subscriptionId) async {
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Confirm Delete', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete this subscription?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: _textColor),
            child: const Text('Delete'),
          ),
        ],
      );
    });

    if (confirm == true) {
      ref.read(deleteSubscriptionProvider(subscriptionId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final subscriptionsAsyncValue = ref.watch(subscriptionsProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Subscription Billing V2', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              showSearch(context: context, delegate: _SubscriptionSearchDelegate(
                searchController: _searchController,
                textColor: _textColor,
                cardColor: _cardColor,
                accentColor: _accentColor,
              ));
            },
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (String? newValue) {
              ref.read(filterStatusProvider.notifier).state = newValue == 'All' ? null : newValue;
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'All',
                child: Text('All Statuses'),
              ),
              const PopupMenuItem<String>(
                value: 'Active',
                child: Text('Active'),
              ),
              const PopupMenuItem<String>(
                value: 'Expired',
                child: Text('Expired'),
              ),
              const PopupMenuItem<String>(
                value: 'Pending',
                child: Text('Pending'),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(subscriptionsProvider);
        },
        child: subscriptionsAsyncValue.when(
          data: (subscriptions) {
            if (subscriptions.isEmpty) {
              return Center(
                child: Text(
                  filterStatus != null || _searchController.text.isNotEmpty
                      ? 'No matching subscriptions found.'
                      : 'No subscriptions found.',
                  style: TextStyle(color: _textColor),
                ),
              );
            }
            return ListView.builder(
              itemCount: subscriptions.length,
              itemBuilder: (context, index) {
                final subscription = subscriptions[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subscription.customerName,
                          style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Plan: ${subscription.planName}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Text(
                          'Amount: ${_formatAmount(subscription.amount, subscription.currency)}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        Row(
                          children: [
                            Text(
                              'Status: ',
                              style: TextStyle(color: _textColor.withOpacity(0.8)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getStatusColor(subscription.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                subscription.status,
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                        Text(
                          'Start Date: ${_formatDate(subscription.startDate)}',
                          style: TextStyle(color: _textColor.withOpacity(0.8)),
                        ),
                        if (subscription.endDate != null)
                          Text(
                            'End Date: ${_formatDate(subscription.endDate!)}',
                            style: TextStyle(color: _textColor.withOpacity(0.8)),
                          ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showSubscriptionDialog(subscription: subscription),
                            ),
                            IconButton(
                              icon: Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _confirmDelete(subscription.id),
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
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: ${error.toString()}',
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showSubscriptionDialog(),
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }
}

class _SubscriptionSearchDelegate extends SearchDelegate<String> {
  final TextEditingController searchController;
  final Color textColor;
  final Color cardColor;
  final Color accentColor;

  _SubscriptionSearchDelegate({
    required this.searchController,
    required this.textColor,
    required this.cardColor,
    required this.accentColor,
  });

  @override
  ThemeData appBarTheme(BuildContext context) {
    return ThemeData(
      appBarTheme: AppBarTheme(
        backgroundColor: cardColor,
        iconTheme: IconThemeData(color: textColor),
        toolbarTextStyle: TextStyle(color: textColor),
        titleTextStyle: TextStyle(color: textColor),
      ),
      inputDecorationTheme: InputDecorationTheme(
        hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: accentColor)),
        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: textColor.withOpacity(0.5))),
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: accentColor,
        selectionColor: accentColor.withOpacity(0.5),
        selectionHandleColor: accentColor,
      ),
      textTheme: TextTheme(
        titleLarge: TextStyle(color: textColor), // For the search input text
      ),
    );
  }

  @override
  List<Widget>? buildActions(BuildContext context) {
    return [
      IconButton(
        icon: const Icon(Icons.clear),
        onPressed: () {
          searchController.clear();
          query = '';
        },
      ),
    ];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return IconButton(
      icon: AnimatedIcon(
        icon: AnimatedIcons.menu_arrow,
        progress: transitionAnimation,
      ),
      onPressed: () {
        close(context, '');
      },
    );
  }

  @override
  Widget buildResults(BuildContext context) {
    // This is where you would typically show the search results.
    // For this implementation, the filtering happens directly in the main screen's Riverpod provider.
    // We just need to update the search query provider.
    searchController.text = query;
    return Center(
      child: Text(
        'Searching for "$query"...',
        style: TextStyle(color: textColor),
      ),
    );
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    // Suggestions can be implemented here if needed.
    // For now, we just update the search query as the user types.
    searchController.text = query;
    return Container(
      color: cardColor,
      child: Center(
        child: Text(
          'Type to search subscriptions',
          style: TextStyle(color: textColor.withOpacity(0.7)),
        ),
      ),
    );
  }
}