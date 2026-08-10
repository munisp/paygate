import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date formatting

// Define a data model for LoyaltyAutoPromotion. Assuming a simple structure for now.
class LoyaltyAutoPromotion {
  final String id;
  final String name;
  final String status;
  final double amount;
  final DateTime startDate;
  final DateTime endDate;

  LoyaltyAutoPromotion({
    required this.id,
    required this.name,
    required this.status,
    required this.amount,
    required this.startDate,
    required this.endDate,
  });

  factory LoyaltyAutoPromotion.fromJson(Map<String, dynamic> json) {
    return LoyaltyAutoPromotion(
      id: json["id"],
      name: json["name"],
      status: json["status"],
      amount: (json["amount"] as num).toDouble(),
      startDate: DateTime.parse(json["startDate"]),
      endDate: DateTime.parse(json["endDate"]),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'status': status,
        'amount': amount,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
      };
}

// StateNotifier for managing the list of loyalty auto promotions
class LoyaltyAutoPromotionsNotifier extends StateNotifier<AsyncValue<List<LoyaltyAutoPromotion>>> {
  final ApiService apiService;
  String _searchQuery = '';

  LoyaltyAutoPromotionsNotifier(this.apiService) : super(const AsyncValue.loading()) {
    fetchPromotions();
  }

  List<LoyaltyAutoPromotion> get filteredPromotions {
    return state.when(
      data: (promotions) {
        if (_searchQuery.isEmpty) {
          return promotions;
        } else {
          return promotions.where((promotion) =>
              promotion.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
              promotion.status.toLowerCase().contains(_searchQuery.toLowerCase())
          ).toList();
        }
      },
      loading: () => [],
      error: (err, st) => [],
    );
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    // Trigger a rebuild of consumers that watch this provider
    state = AsyncValue.data(state.value!); // Re-emit current data to trigger filter
  }

  Future<void> fetchPromotions() async {
    try {
      state = const AsyncValue.loading();
      final response = await apiService.get('/trpc/loyaltyAutoPromotion.list');
      final List<LoyaltyAutoPromotion> promotions = (response['promotions'] as List)
          .map((e) => LoyaltyAutoPromotion.fromJson(e as Map<String, dynamic>))
          .toList();
      state = AsyncValue.data(promotions);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createPromotion(LoyaltyAutoPromotion newPromotion) async {
    try {
      await apiService.post('/trpc/loyaltyAutoPromotion.create', body: newPromotion.toJson());
      await fetchPromotions(); // Refresh list after creation
    } catch (e, st) {
      // Handle error, e.g., show a snackbar
      debugPrint('Error creating promotion: $e');
    }
  }

  Future<void> updatePromotion(LoyaltyAutoPromotion updatedPromotion) async {
    try {
      await apiService.post('/trpc/loyaltyAutoPromotion.update', body: updatedPromotion.toJson());
      await fetchPromotions(); // Refresh list after update
    } catch (e, st) {
      debugPrint('Error updating promotion: $e');
    }
  }

  Future<void> deletePromotion(String promotionId) async {
    try {
      await apiService.post('/trpc/loyaltyAutoPromotion.delete', body: {'id': promotionId});
      await fetchPromotions(); // Refresh list after deletion
    } catch (e, st) {
      debugPrint('Error deleting promotion: $e');
    }
  }
}

final loyaltyAutoPromotionsProvider = StateNotifierProvider<
    LoyaltyAutoPromotionsNotifier, AsyncValue<List<LoyaltyAutoPromotion>>>((ref) {
  return LoyaltyAutoPromotionsNotifier(ref.read(apiServiceProvider));
});

class LoyaltyAutoPromotionScreen extends ConsumerStatefulWidget {
  const LoyaltyAutoPromotionScreen({super.key});

  @override
  ConsumerState<LoyaltyAutoPromotionScreen> createState() => _LoyaltyAutoPromotionScreenState();
}

class _LoyaltyAutoPromotionScreenState extends ConsumerState<LoyaltyAutoPromotionScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  // Text editing controllers for forms
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _statusController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();
  DateTime? _startDate;
  DateTime? _endDate;

  @override
  void dispose() {
    _nameController.dispose();
    _amountController.dispose();
    _statusController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'inactive':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  Future<void> _showPromotionDialog({
    LoyaltyAutoPromotion? promotion,
    required Function(LoyaltyAutoPromotion) onSubmit,
  }) async {
    bool isEditing = promotion != null;
    if (isEditing) {
      _nameController.text = promotion.name;
      _amountController.text = promotion.amount.toString();
      _statusController.text = promotion.status;
      _startDate = promotion.startDate;
      _endDate = promotion.endDate;
    } else {
      _nameController.clear();
      _amountController.clear();
      _statusController.clear();
      _startDate = null;
      _endDate = null;
    }

    await showDialog(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text(isEditing ? 'Edit Promotion' : 'Create Promotion', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: 'Promotion Name',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Amount',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _statusController,
                decoration: InputDecoration(
                  labelText: 'Status',
                  labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
                style: TextStyle(color: _textColor),
              ),
              const SizedBox(height: 16),
              ListTile(
                title: Text('Start Date: ${_startDate == null ? 'Select Date' : DateFormat('yyyy-MM-dd').format(_startDate!)}', style: TextStyle(color: _textColor)),
                trailing: Icon(Icons.calendar_today, color: _accentColor),
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: _startDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: _accentColor, // header background color
                            onPrimary: _textColor, // header text color
                            surface: _cardColor, // calendar background color
                            onSurface: _textColor, // calendar text color
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(foregroundColor: _accentColor), // button text color
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null && picked != _startDate) {
                    setState(() {
                      _startDate = picked;
                    });
                  }
                },
              ),
              ListTile(
                title: Text('End Date: ${_endDate == null ? 'Select Date' : DateFormat('yyyy-MM-dd').format(_endDate!)}', style: TextStyle(color: _textColor)),
                trailing: Icon(Icons.calendar_today, color: _accentColor),
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: _endDate ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2101),
                    builder: (context, child) {
                      return Theme(
                        data: ThemeData.dark().copyWith(
                          colorScheme: ColorScheme.dark(
                            primary: _accentColor,
                            onPrimary: _textColor,
                            surface: _cardColor,
                            onSurface: _textColor,
                          ),
                          textButtonTheme: TextButtonThemeData(
                            style: TextButton.styleFrom(foregroundColor: _accentColor),
                          ),
                        ),
                        child: child!,
                      );
                    },
                  );
                  if (picked != null && picked != _endDate) {
                    setState(() {
                      _endDate = picked;
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
              if (_nameController.text.isNotEmpty &&
                  _amountController.text.isNotEmpty &&
                  _statusController.text.isNotEmpty &&
                  _startDate != null &&
                  _endDate != null) {
                final newPromotion = LoyaltyAutoPromotion(
                  id: isEditing ? promotion!.id : UniqueKey().toString(), // Use existing ID or generate new
                  name: _nameController.text,
                  status: _statusController.text,
                  amount: double.parse(_amountController.text),
                  startDate: _startDate!,
                  endDate: _endDate!,
                );
                onSubmit(newPromotion);
                Navigator.of(context).pop();
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: _accentColor),
            child: Text(isEditing ? 'Save' : 'Create', style: TextStyle(color: _textColor)),
          ),
        ],
      );
    });
  }

  Future<void> _confirmDelete(String promotionId) async {
    final bool? confirm = await showDialog<bool>(context: context, builder: (context) {
      return AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Confirm Delete', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete this promotion?', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: TextStyle(color: _textColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: Text('Delete', style: TextStyle(color: _textColor)),
          ),
        ],
      );
    });

    if (confirm == true) {
      ref.read(loyaltyAutoPromotionsProvider.notifier).deletePromotion(promotionId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final promotionsAsyncValue = ref.watch(loyaltyAutoPromotionsProvider);
    final promotionsNotifier = ref.read(loyaltyAutoPromotionsProvider.notifier);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Search promotions...', 
            hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
            border: InputBorder.none,
          ),
          style: TextStyle(color: _textColor),
          onChanged: (query) {
            promotionsNotifier.setSearchQuery(query);
          },
        ),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: () => promotionsNotifier.fetchPromotions(),
        child: promotionsAsyncValue.when(
          loading: () => Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: ${err.toString()}', style: TextStyle(color: _textColor)),
          ),
          data: (promotions) {
            final filteredPromotions = promotionsNotifier.filteredPromotions;
            if (filteredPromotions.isEmpty) {
              return Center(
                child: Text('No loyalty auto promotions found.', style: TextStyle(color: _textColor)),
              );
            }
            return ListView.builder(
              itemCount: filteredPromotions.length,
              itemBuilder: (context, index) {
                final promotion = filteredPromotions[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(promotion.name, style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text('Status: ', style: TextStyle(color: _textColor)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getStatusColor(promotion.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(promotion.status, style: TextStyle(color: _textColor, fontSize: 12)),
                            ),
                          ],
                        ),
                        Text('Amount: ₦${promotion.amount.toStringAsFixed(2)}', style: TextStyle(color: _textColor)), // Assuming Naira
                        Text('Start Date: ${DateFormat('yyyy-MM-dd').format(promotion.startDate)}', style: TextStyle(color: _textColor)),
                        Text('End Date: ${DateFormat('yyyy-MM-dd').format(promotion.endDate)}', style: TextStyle(color: _textColor)),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showPromotionDialog(
                                promotion: promotion,
                                onSubmit: (updatedPromotion) {
                                  promotionsNotifier.updatePromotion(updatedPromotion);
                                },
                              ),
                            ),
                            IconButton(
                              icon: Icon(Icons.delete, color: Colors.red),
                              onPressed: () => _confirmDelete(promotion.id),
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
        onPressed: () => _showPromotionDialog(
          onSubmit: (newPromotion) {
            promotionsNotifier.createPromotion(newPromotion);
          },
        ),
        backgroundColor: _accentColor,
        child: Icon(Icons.add, color: _textColor),
      ),
    );
  }
}
