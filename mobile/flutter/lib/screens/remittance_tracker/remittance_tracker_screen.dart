import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data Model for Remittance
class Remittance {
  final String id;
  final double amount;
  final String currency;
  final String status;
  final DateTime date;

  Remittance({
    required this.id,
    required this.amount,
    required this.currency,
    required this.status,
    required this.date,
  });

  factory Remittance.fromJson(Map<String, dynamic> json) {
    return Remittance(
      id: json['id'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      date: DateTime.parse(json['date']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'amount': amount,
        'currency': currency,
        'status': status,
        'date': date.toIso8601String(),
      };
}

// State for Remittance List
class RemittanceListState {
  final bool isLoading;
  final String? error;
  final List<Remittance> remittances;
  final String searchQuery;

  RemittanceListState({
    this.isLoading = false,
    this.error,
    this.remittances = const [],
    this.searchQuery = '',
  });

  RemittanceListState copyWith({
    bool? isLoading,
    String? error,
    List<Remittance>? remittances,
    String? searchQuery,
  }) {
    return RemittanceListState(
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
      remittances: remittances ?? this.remittances,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

// StateNotifier for Remittance List
class RemittanceListNotifier extends StateNotifier<RemittanceListState> {
  RemittanceListNotifier(this.ref) : super(RemittanceListState()) {
    fetchRemittances();
  }

  final Ref ref;

  Future<void> fetchRemittances() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final api = ref.read(apiServiceProvider);
      // Assuming the tRPC router namespace for RemittanceTracker is 'remittances.list'
      final response = await api.get('/trpc/remittances.list');
      final List<Remittance> fetchedRemittances = (
        response as List
      ).map((json) => Remittance.fromJson(json)).toList();
      state = state.copyWith(remittances: fetchedRemittances, isLoading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), isLoading: false);
    }
  }

  void updateSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  List<Remittance> get filteredRemittances {
    if (state.searchQuery.isEmpty) {
      return state.remittances;
    } else {
      return state.remittances.where((remittance) {
        return remittance.id.toLowerCase().contains(state.searchQuery.toLowerCase()) ||
               remittance.status.toLowerCase().contains(state.searchQuery.toLowerCase());
      }).toList();
    }
  }

  Future<void> createRemittance(Remittance newRemittance) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/remittances.create', body: newRemittance.toJson());
      fetchRemittances(); // Refresh the list after creation
    } catch (e) {
      // Handle error, e.g., show a snackbar
      print('Error creating remittance: $e');
    }
  }

  Future<void> updateRemittance(Remittance updatedRemittance) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/remittances.update', body: updatedRemittance.toJson());
      fetchRemittances(); // Refresh the list after update
    } catch (e) {
      // Handle error
      print('Error updating remittance: $e');
    }
  }

  Future<void> deleteRemittance(String id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/remittances.delete', body: {'id': id});
      fetchRemittances(); // Refresh the list after deletion
    } catch (e) {
      // Handle error
      print('Error deleting remittance: $e');
    }
  }
}

// Provider for Remittance List
final remittanceListProvider = StateNotifierProvider<
    RemittanceListNotifier, RemittanceListState>(
  (ref) => RemittanceListNotifier(ref),
);

class RemittanceTrackerScreen extends ConsumerStatefulWidget {
  const RemittanceTrackerScreen({super.key});

  @override
  ConsumerState<RemittanceTrackerScreen> createState() => _RemittanceTrackerScreenState();
}

class _RemittanceTrackerScreenState extends ConsumerState<RemittanceTrackerScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(remittanceListProvider.notifier).updateSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    switch (status.toLowerCase()) {
      case 'completed':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'failed':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status,
        style: TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'USD' ? '\$' : '₦', decimalDigits: 2);
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy - hh:mm a').format(date.toLocal());
  }

  Future<void> _showRemittanceDialog({
    Remittance? remittance,
  }) async {
    final isEditing = remittance != null;
    final TextEditingController idController = TextEditingController(text: remittance?.id);
    final TextEditingController amountController = TextEditingController(text: remittance?.amount.toString());
    String? selectedCurrency = remittance?.currency ?? 'USD';
    String? selectedStatus = remittance?.status ?? 'Pending';
    DateTime? selectedDate = remittance?.date ?? DateTime.now();

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Remittance' : 'Add Remittance', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: idController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'ID',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                readOnly: isEditing, // ID should not be editable
              ),
              const SizedBox(height: 16),
              TextField(
                controller: amountController,
                style: TextStyle(color: _textColor),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedCurrency,
                dropdownColor: _cardColor,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Currency',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: ['USD', 'NGN'].map((String currency) {
                  return DropdownMenuItem<String>(
                    value: currency,
                    child: Text(currency, style: TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    selectedCurrency = newValue;
                  }
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: selectedStatus,
                dropdownColor: _cardColor,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                items: ['Pending', 'Completed', 'Failed'].map((String status) {
                  return DropdownMenuItem<String>(
                    value: status,
                    child: Text(status, style: TextStyle(color: _textColor)),
                  );
                }).toList(),
                onChanged: (String? newValue) {
                  if (newValue != null) {
                    selectedStatus = newValue;
                  }
                },
              ),
              const SizedBox(height: 16),
              ListTile(
                title: Text('Date: ${_formatDate(selectedDate!)}', style: TextStyle(color: _textColor)),
                trailing: Icon(Icons.calendar_today, color: _accentColor),
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: selectedDate!,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: _accentColor, // header background color
                            onPrimary: Colors.white, // header text color
                            onSurface: _textColor, // body text color
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(foregroundColor: _accentColor), // button text color
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null && picked != selectedDate) {
                    setState(() {
                      selectedDate = picked;
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
              if (idController.text.isEmpty || amountController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please fill all fields')),
                );
                return;
              }
              final newOrUpdatedRemittance = Remittance(
                id: idController.text,
                amount: double.parse(amountController.text),
                currency: selectedCurrency!,
                status: selectedStatus!,
                date: selectedDate!,
              );
              if (isEditing) {
                ref.read(remittanceListProvider.notifier).updateRemittance(newOrUpdatedRemittance);
              } else {
                ref.read(remittanceListProvider.notifier).createRemittance(newOrUpdatedRemittance);
              }
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: Text(isEditing ? 'Save' : 'Add', style: TextStyle(color: Colors.white)),
          ),
        ],
      );
    });
  }

  Future<void> _confirmDelete(String id) async {
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Delete Remittance', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete remittance ID: $id?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      );
    });

    if (confirm == true) {
      ref.read(remittanceListProvider.notifier).deleteRemittance(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final remittanceListNotifier = ref.read(remittanceListProvider.notifier);
    final remittanceListState = ref.watch(remittanceListProvider);
    final filteredRemittances = remittanceListNotifier.filteredRemittances;

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('Remittance Tracker', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              style: TextStyle(color: _textColor),
              decoration: InputDecoration(
                hintText: 'Search by ID or Status',
                hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => remittanceListNotifier.fetchRemittances(),
              color: _accentColor,
              child: Builder(
                builder: (context) {
                  if (remittanceListState.isLoading) {
                    return Center(
                      child: CircularProgressIndicator(color: _accentColor),
                    );
                  } else if (remittanceListState.error != null) {
                    return Center(
                      child: Text(
                        'Error: ${remittanceListState.error}',
                        style: TextStyle(color: _textColor),
                      ),
                    );
                  } else if (filteredRemittances.isEmpty) {
                    return Center(
                      child: Text(
                        'No remittances found.',
                        style: TextStyle(color: _textColor),
                      ),
                    );
                  } else {
                    return ListView.builder(
                      itemCount: filteredRemittances.length,
                      itemBuilder: (context, index) {
                        final remittance = filteredRemittances[index];
                        return Card(
                          color: _cardColor,
                          margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'ID: ${remittance.id}',
                                      style: TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                                    ),
                                    _buildStatusBadge(remittance.status),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Amount: ${_formatAmount(remittance.amount, remittance.currency)}',
                                  style: TextStyle(color: _textColor),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Date: ${_formatDate(remittance.date)}',
                                  style: TextStyle(color: _textColor),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    IconButton(
                                      icon: Icon(Icons.edit, color: _accentColor),
                                      onPressed: () {
                                        _showRemittanceDialog(remittance: remittance);
                                      },
                                    ),
                                    IconButton(
                                      icon: Icon(Icons.delete, color: Colors.redAccent),
                                      onPressed: () {
                                        _confirmDelete(remittance.id);
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
                  }
                },
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showRemittanceDialog();
        },
        backgroundColor: _accentColor,
        child: Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}
