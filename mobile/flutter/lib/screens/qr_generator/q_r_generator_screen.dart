import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Mock data models for QR codes
class QrCode {
  final String id;
  final String description;
  final double amount;
  final String currency;
  final String status; // e.g., 'active', 'expired', 'pending'
  final DateTime createdAt;
  final String imageUrl; // URL to the generated QR image

  QrCode({
    required this.id,
    required this.description,
    required this.amount,
    required this.currency,
    required this.status,
    required this.createdAt,
    required this.imageUrl,
  });

  factory QrCode.fromJson(Map<String, dynamic> json) => QrCode(
        id: json['id'],
        description: json['description'],
        amount: json['amount'].toDouble(),
        currency: json['currency'],
        status: json['status'],
        createdAt: DateTime.parse(json['createdAt']),
        imageUrl: json['imageUrl'],
      );
}

// Riverpod provider for QR codes list
final qrCodesProvider = FutureProvider.autoDispose<List<QrCode>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/qr.list');
  // Simulate network delay
  await Future.delayed(const Duration(milliseconds: 500));
  if (response.statusCode == 200) {
    final List<dynamic> data = response.data['result']['data'];
    return data.map((json) => QrCode.fromJson(json)).toList();
  } else {
    throw Exception('Failed to load QR codes');
  }
});

class QRGeneratorScreen extends ConsumerStatefulWidget {
  const QRGeneratorScreen({super.key});

  @override
  ConsumerState<QRGeneratorScreen> createState() => _QRGeneratorScreenState();
}

class _QRGeneratorScreenState extends ConsumerState<QRGeneratorScreen> {
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _descriptionController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _generateQrCode() async {
    final description = _descriptionController.text;
    final amount = double.tryParse(_amountController.text);

    if (description.isEmpty || amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid description and amount.')),
      );
      return;
    }

    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.post(
        '/trpc/qr.generate',
        body: {'description': description, 'amount': amount, 'currency': 'NGN'},
      );
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('QR Code generated successfully!'))
        );
        ref.invalidate(qrCodesProvider);
        _descriptionController.clear();
        _amountController.clear();
        Navigator.of(context).pop(); // Close the dialog
      } else {
        throw Exception('Failed to generate QR code');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error generating QR code: ${e.toString()}')),
      );
    }
  }

  Future<void> _deleteQrCode(String qrId) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: const Text('Are you sure you want to delete this QR code?', style: TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      try {
        final api = ref.read(apiServiceProvider);
        final response = await api.post(
          '/trpc/qr.delete',
          body: {'id': qrId},
        );
        if (response.statusCode == 200) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('QR Code deleted successfully!'))
          );
          ref.invalidate(qrCodesProvider);
        } else {
          throw Exception('Failed to delete QR code');
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error deleting QR code: ${e.toString()}')),
        );
      }
    }
  }

  void _showGenerateQrDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Generate New QR Code', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _descriptionController,
                  decoration: InputDecoration(
                    labelText: 'Description',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.grey.shade700),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount (NGN)',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.grey.shade700),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
            ),
            ElevatedButton(
              onPressed: _generateQrCode,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366f1),
                foregroundColor: const Color(0xFFf1f5f9),
              ),
              child: const Text('Generate'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final qrCodesAsyncValue = ref.watch(qrCodesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('QR Code Generator', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline, color: Color(0xFFf1f5f9)),
            onPressed: _showGenerateQrDialog,
            tooltip: 'Generate New QR Code',
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              decoration: InputDecoration(
                hintText: 'Search QR codes...',
                hintStyle: TextStyle(color: Colors.grey.shade400),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                filled: true,
                fillColor: const Color(0xFF1e293b),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(qrCodesProvider.future),
              color: const Color(0xFF6366f1),
              backgroundColor: const Color(0xFF1e293b),
              child: qrCodesAsyncValue.when(
                data: (qrCodes) {
                  final filteredQrCodes = qrCodes.where((qr) {
                    return qr.description.toLowerCase().contains(_searchQuery.toLowerCase());
                  }).toList();

                  if (filteredQrCodes.isEmpty) {
                    return Center(
                      child: Text(
                        _searchQuery.isEmpty ? 'No QR codes generated yet.' : 'No matching QR codes found.',
                        style: TextStyle(color: Colors.grey.shade400, fontSize: 16),
                      ),
                    );
                  }

                  return ListView.builder(
                    itemCount: filteredQrCodes.length,
                    itemBuilder: (context, index) {
                      final qr = filteredQrCodes[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        color: const Color(0xFF1e293b),
                        elevation: 2,
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      qr.description,
                                      style: const TextStyle(
                                        color: Color(0xFFf1f5f9),
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  _buildStatusBadge(qr.status),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Amount: ${qr.currency == 'NGN' ? '₦' : '$'}${qr.amount.toStringAsFixed(2)}',
                                style: TextStyle(color: Colors.grey.shade300, fontSize: 16),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Generated: ${qr.createdAt.day}/${qr.createdAt.month}/${qr.createdAt.year}',
                                style: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                              ),
                              const SizedBox(height: 16),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.qr_code, color: Color(0xFF6366f1)),
                                    onPressed: () {
                                      // Simulate viewing QR code image
                                      showDialog(
                                        context: context,
                                        builder: (context) => AlertDialog(
                                          backgroundColor: const Color(0xFF1e293b),
                                          title: const Text('QR Code Image', style: TextStyle(color: Color(0xFFf1f5f9))),
                                          content: Image.network(qr.imageUrl, errorBuilder: (context, error, stackTrace) => const Icon(Icons.broken_image, color: Colors.red)),
                                          actions: [
                                            TextButton(
                                              onPressed: () => Navigator.of(context).pop(),
                                              child: const Text('Close', style: TextStyle(color: Color(0xFF6366f1))),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                    tooltip: 'View QR Code',
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.redAccent),
                                    onPressed: () => _deleteQrCode(qr.id),
                                    tooltip: 'Delete QR Code',
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
                loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))),
                error: (error, stack) => Center(
                  child: Text('Error: ${error.toString()}', style: const TextStyle(color: Colors.redAccent)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    String text;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green.shade700;
        text = 'Active';
        break;
      case 'expired':
        color = Colors.red.shade700;
        text = 'Expired';
        break;
      case 'pending':
        color = Colors.orange.shade700;
        text = 'Pending';
        break;
      default:
        color = Colors.grey.shade700;
        text = 'Unknown';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }
}