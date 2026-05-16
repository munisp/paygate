import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define the tRPC router namespace for WhiteLabelPreview
final whiteLabelPreviewProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final response = await api.get('/trpc/whiteLabel.getPreview');
    return response.data as Map<String, dynamic>;
  } catch (e) {
    throw Exception('Failed to load white label preview: $e');
  }
});

class WhiteLabelPreviewScreen extends ConsumerStatefulWidget {
  const WhiteLabelPreviewScreen({super.key});

  @override
  ConsumerState<WhiteLabelPreviewScreen> createState() => _WhiteLabelPreviewScreenState();
}

class _WhiteLabelPreviewScreenState extends ConsumerState<WhiteLabelPreviewScreen> {
  final Color _backgroundColor = const Color(0xFF0f172a);
  final Color _cardColor = const Color(0xFF1e293b);
  final Color _textColor = const Color(0xFFf1f5f9);
  final Color _accentColor = const Color(0xFF6366f1);

  @override
  Widget build(BuildContext context) {
    final whiteLabelPreviewAsyncValue = ref.watch(whiteLabelPreviewProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: Text('White Label Preview', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(whiteLabelPreviewProvider.future),
        child: whiteLabelPreviewAsyncValue.when(
          loading: () => Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: ${err.toString()}', style: TextStyle(color: _textColor)),
          ),
          data: (data) {
            // Display the data here
            return ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                _buildInfoCard('Preview Name', data['name'] ?? 'N/A'),
                _buildInfoCard('Status', data['status'] ?? 'N/A', isStatus: true),
                _buildInfoCard('Amount', _formatAmount(data['amount'] ?? 0.0, data['currency'] ?? 'USD')),
                _buildInfoCard('Created At', _formatDate(data['createdAt'])),
                // Add more fields as needed based on the actual data structure
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () {
                    // Implement edit functionality or navigate to an edit screen
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Edit functionality not yet implemented')),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _accentColor,
                    foregroundColor: _textColor,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Edit White Label Settings', style: TextStyle(fontSize: 16)),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildInfoCard(String title, String value, {bool isStatus = false}) {
    return Card(
      color: _cardColor,
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14),
            ),
            const SizedBox(height: 4),
            isStatus
                ? _buildStatusBadge(value)
                : Text(
                    value,
                    style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;
    switch (status.toLowerCase()) {
      case 'active':
        badgeColor = Colors.green;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      case 'inactive':
        badgeColor = Colors.red;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.bold),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    String symbol = currency == 'NGN' ? '₦' : '$'; // Naira or USD
    return '$symbol${amount.toStringAsFixed(2)}';
  }

  String _formatDate(dynamic date) {
    if (date == null) return 'N/A';
    DateTime dateTime;
    if (date is String) {
      dateTime = DateTime.parse(date);
    } else if (date is DateTime) {
      dateTime = date;
    } else {
      return 'N/A';
    }
    return '${dateTime.day}/${dateTime.month}/${dateTime.year} ${dateTime.hour}:${dateTime.minute}';
  }
}
