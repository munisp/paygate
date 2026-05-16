import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Assuming dioProvider is defined elsewhere, e.g., in a providers.dart file.
// For this example, a placeholder is provided.
final dioProvider = Provider<Dio>((ref) => Dio(BaseOptions(baseUrl: 'http://localhost:3000'))); // Placeholder base URL

// Data model for a loyalty transaction
class LoyaltyTransaction {
  final String id;
  final String description;
  final int points;
  final DateTime date;

  LoyaltyTransaction({
    required this.id,
    required this.description,
    required this.points,
    required this.date,
  });

  factory LoyaltyTransaction.fromJson(Map<String, dynamic> json) {
    return LoyaltyTransaction(
      id: json['id'] as String,
      description: json['description'] as String,
      points: json['points'] as int,
      date: DateTime.parse(json['date'] as String),
    );
  }
}

class LoyaltyRedemptionScreen extends ConsumerStatefulWidget {
  const LoyaltyRedemptionScreen({super.key});

  @override
  ConsumerState<LoyaltyRedemptionScreen> createState() => _LoyaltyRedemptionScreenState();
}

class _LoyaltyRedemptionScreenState extends ConsumerState<LoyaltyRedemptionScreen> {
  bool _isLoading = true;
  String? _error;
  List<LoyaltyTransaction> _transactions = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get('/api/trpc/wave99.getLoyaltyTransactions');
      // Assuming the response data is a list of transaction maps
      final List<dynamic> data = response.data['result']['data']; // Adjust based on actual tRPC response structure
      setState(() {
        _transactions = data.map((json) => LoyaltyTransaction.fromJson(json)).toList();
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to load transactions: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: ${e.toString()}';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _redeemPoints() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      // Assuming redemption requires some data, e.g., points to redeem
      final response = await dio.post(
        '/api/trpc/wave99.redeemPoints',
        data: {'pointsToRedeem': 100}, // Example data, adjust as needed
      );
      // Handle successful redemption, e.g., show a success message and refresh data
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Points redeemed successfully!')), 
        );
        _loadData(); // Refresh the transaction list
      } else {
        setState(() {
          _error = 'Failed to redeem points: ${response.statusMessage}';
        });
      }
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to redeem points: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred during redemption: ${e.toString()}';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Loyalty Redemption History'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(8.0),
                      child: ElevatedButton(
                        onPressed: _redeemPoints,
                        child: const Text('Redeem Points'),
                      ),
                    ),
                    Expanded(
                      child: _transactions.isEmpty
                          ? const Center(child: Text('No loyalty transactions found.'))
                          : ListView.builder(
                              itemCount: _transactions.length,
                              itemBuilder: (context, index) {
                                final transaction = _transactions[index];
                                return Card(
                                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                                  child: ListTile(
                                    title: Text(transaction.description),
                                    subtitle: Text('Date: ${transaction.date.toLocal().toShortDateString()}'),
                                    trailing: Text('${transaction.points} points'),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }
}

extension on DateTime {
  String toShortDateString() {
    return '${year}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
  }
}
