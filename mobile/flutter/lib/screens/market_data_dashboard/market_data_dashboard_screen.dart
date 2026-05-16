import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date and currency formatting

// Mock Market Data Model (replace with actual model from API response)
class MarketDataItem {
  final String id;
  final String name;
  final double price;
  final String currency;
  final String status;
  final DateTime lastUpdated;

  MarketDataItem({
    required this.id,
    required this.name,
    required this.price,
    required this.currency,
    required this.status,
    required this.lastUpdated,
  });

  factory MarketDataItem.fromJson(Map<String, dynamic> json) {
    return MarketDataItem(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toDouble(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      lastUpdated: DateTime.parse(json['lastUpdated'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price': price,
        'currency': currency,
        'status': status,
        'lastUpdated': lastUpdated.toIso8601String(),
      };
}

// Define a FutureProvider for fetching market data
final marketDataProvider = FutureProvider<List<MarketDataItem>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  try {
    // Assuming a tRPC endpoint for market data list
    final response = await apiService.get('/trpc/marketData.list');
    // Ensure response['data'] is a List<dynamic> before mapping
    if (response['data'] is List) {
      final List<dynamic> data = response['data'] as List<dynamic>;
      return data.map((item) => MarketDataItem.fromJson(item)).toList();
    } else {
      throw Exception('Invalid data format from API');
    }
  } catch (e) {
    // For demonstration, return mock data on error or if API call fails
    print('API call failed, returning mock data: $e');
    return [
      MarketDataItem(id: '1', name: 'Gold', price: 2350.75, currency: 'USD', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(hours: 1))),
      MarketDataItem(id: '2', name: 'Silver', price: 29.80, currency: 'USD', status: 'Inactive', lastUpdated: DateTime.now().subtract(const Duration(days: 2))),
      MarketDataItem(id: '3', name: 'Crude Oil', price: 78.12, currency: 'USD', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(minutes: 30))),
      MarketDataItem(id: '4', name: 'Bitcoin', price: 67500.00, currency: 'USD', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(hours: 5))),
      MarketDataItem(id: '5', name: 'Ethereum', price: 3100.50, currency: 'USD', status: 'Pending', lastUpdated: DateTime.now().subtract(const Duration(days: 1))),
      MarketDataItem(id: '6', name: 'Naira Exchange Rate', price: 1450.00, currency: 'NGN', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(hours: 3))),
    ];
  }
});

class MarketDataDashboardScreen extends ConsumerStatefulWidget {
  const MarketDataDashboardScreen({super.key});

  @override
  ConsumerState<MarketDataDashboardScreen> createState() => _MarketDataDashboardScreenState();
}

class _MarketDataDashboardScreenState extends ConsumerState<MarketDataDashboardScreen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

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

  Future<void> _refreshData() async {
    ref.invalidate(marketDataProvider);
    await ref.read(marketDataProvider.future);
  }

  // Placeholder for actual API calls
  Future<void> _callApi(String endpoint, {Map<String, dynamic>? body}) async {
    final apiService = ref.read(apiServiceProvider);
    try {
      if (body != null) {
        await apiService.post(endpoint, body: body);
      } else {
        await apiService.get(endpoint);
      }
      // Invalidate provider to refresh data after successful operation
      ref.invalidate(marketDataProvider);
    } catch (e) {
      // Handle API error, e.g., show a SnackBar
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Operation failed: $e', style: const TextStyle(color: _textColor)), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showCreateDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController priceController = TextEditingController();
    final TextEditingController currencyController = TextEditingController(text: 'USD');
    final TextEditingController statusController = TextEditingController(text: 'Active');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Create New Market Data', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: priceController,
                style: TextStyle(color: _textColor),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Price', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Currency', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () async {
              final newItem = MarketDataItem(
                id: DateTime.now().millisecondsSinceEpoch.toString(), // Mock ID
                name: nameController.text,
                price: double.tryParse(priceController.text) ?? 0.0,
                currency: currencyController.text,
                status: statusController.text,
                lastUpdated: DateTime.now(),
              );
              await _callApi('/trpc/marketData.create', body: newItem.toJson());
              if (mounted) Navigator.pop(context);
            },
            child: Text('Create', style: TextStyle(color: _accentColor)),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(MarketDataItem item) {
    final TextEditingController nameController = TextEditingController(text: item.name);
    final TextEditingController priceController = TextEditingController(text: item.price.toString());
    final TextEditingController currencyController = TextEditingController(text: item.currency);
    final TextEditingController statusController = TextEditingController(text: item.status);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Edit ${item.name}', style: TextStyle(color: _textColor)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Name', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: priceController,
                style: TextStyle(color: _textColor),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Price', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: currencyController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Currency', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: statusController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  labelText: 'Status', labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                  focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () async {
              final updatedItem = MarketDataItem(
                id: item.id,
                name: nameController.text,
                price: double.tryParse(priceController.text) ?? item.price,
                currency: currencyController.text,
                status: statusController.text,
                lastUpdated: DateTime.now(),
              );
              await _callApi('/trpc/marketData.update', body: updatedItem.toJson());
              if (mounted) Navigator.pop(context);
            },
            child: Text('Save', style: TextStyle(color: _accentColor)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmationDialog(MarketDataItem item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: _cardColor,
        title: Text('Delete ${item.name}?', style: TextStyle(color: _textColor)),
        content: Text('Are you sure you want to delete ${item.name}? This action cannot be undone.', style: TextStyle(color: _textColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: _accentColor)),
          ),
          TextButton(
            onPressed: () async {
              await _callApi('/trpc/marketData.delete', body: {'id': item.id});
              if (mounted) Navigator.pop(context);
            },
            child: Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final marketDataAsyncValue = ref.watch(marketDataProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Market Data Dashboard', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: _showCreateDialog,
            tooltip: 'Add New Market Data',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: TextStyle(color: _textColor),
                decoration: InputDecoration(
                  hintText: 'Search market data...', hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
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
              child: marketDataAsyncValue.when(
                data: (data) {
                  final filteredData = data.where((item) {
                    return item.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                           item.status.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (filteredData.isEmpty) {
                    return Center(
                      child: Text(
                        _searchQuery.isEmpty ? 'No market data available.' : 'No matching market data found.',
                        style: TextStyle(color: _textColor, fontSize: 18),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredData.length,
                    itemBuilder: (context, index) {
                      final item = filteredData[index];
                      final currencyFormatter = NumberFormat.currency(
                        locale: 'en_US',
                        symbol: item.currency == 'NGN' ? '₦' : '\$',
                        decimalDigits: 2,
                      );
                      final dateFormatter = DateFormat('MMM dd, yyyy HH:mm');

                      Color statusColor;
                      switch (item.status) {
                        case 'Active':
                          statusColor = Colors.green;
                          break;
                        case 'Inactive':
                          statusColor = Colors.red;
                          break;
                        case 'Pending':
                          statusColor = Colors.orange;
                          break;
                        default:
                          statusColor = Colors.grey;
                      }

                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(item.name, style: TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Text('Price: ${currencyFormatter.format(item.price)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                              Text('Last Updated: ${dateFormatter.format(item.lastUpdated)}', style: TextStyle(color: _textColor.withOpacity(0.8))),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: statusColor.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(item.status, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: _accentColor),
                                onPressed: () => _showEditDialog(item),
                                tooltip: 'Edit',
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(item),
                                tooltip: 'Delete',
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
                    style: TextStyle(color: Colors.red, fontSize: 18),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
