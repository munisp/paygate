import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Assuming dioProvider is defined elsewhere, e.g., in a providers.dart file
// For demonstration, let's define a placeholder provider here.
// In a real application, this would be in a separate file and imported.
final dioProvider = Provider<Dio>((ref) => Dio());

class TransactionReceiptsScreen extends ConsumerStatefulWidget {
  const TransactionReceiptsScreen({super.key});

  @override
  ConsumerState<TransactionReceiptsScreen> createState() => _TransactionReceiptsScreenState();
}

class _TransactionReceiptsScreenState extends ConsumerState<TransactionReceiptsScreen> {
  List<Map<String, dynamic>> _receipts = [];
  bool _isLoading = true;
  String? _error;

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
      final response = await dio.get('/api/trpc/transactions.list');
      // Assuming the response data is a list of maps, similar to the static data structure
      setState(() {
        _receipts = List<Map<String, dynamic>>.from(response.data);
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to load receipts: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: $e';
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
        title: const Text('Transaction Receipts'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red, fontSize: 16),
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: _loadData,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : _receipts.isEmpty
                  ? const Center(child: Text('No receipts found.'))
                  : ListView.builder(
                      itemCount: _receipts.length,
                      itemBuilder: (context, index) {
                        final receipt = _receipts[index];
                        return Card(
                          margin: const EdgeInsets.all(8.0),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('ID: ${receipt['id']}'),
                                Text('Amount: ${receipt['amount']} ${receipt['currency']}'),
                                Text('Date: ${receipt['date']}'),
                                Text('Status: ${receipt['status']}'),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
