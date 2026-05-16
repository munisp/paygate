import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Assuming a data model for USSD session
class USSDSession {
  final String id;
  final String phoneNumber;
  final String serviceCode;
  final String status;
  final double amount;
  final String currency;
  final DateTime createdAt;
  final String? description; // Added for details

  USSDSession({
    required this.id,
    required this.phoneNumber,
    required this.serviceCode,
    required this.status,
    required this.amount,
    required this.currency,
    required this.createdAt,
    this.description,
  });

  factory USSDSession.fromJson(Map<String, dynamic> json) {
    return USSDSession(
      id: json['id'],
      phoneNumber: json['phoneNumber'],
      serviceCode: json['serviceCode'],
      status: json['status'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] ?? 'NGN', // Default to NGN if not provided
      createdAt: DateTime.parse(json['createdAt']),
      description: json['description'],
    );
  }
}

// Provider for USSD sessions list with search and filter
final ussdSessionsProvider = FutureProvider.autoDispose.family<List<USSDSession>, String>((ref, query) async {
  final apiService = ref.read(apiServiceProvider);
  try {
    final response = await apiService.get('/trpc/ussd.list', params: {'query': query});
    return (response as List).map((e) => USSDSession.fromJson(e)).toList();
  } catch (e) {
    throw Exception('Failed to load USSD sessions: $e');
  }
});

class USSDSessionsScreen extends ConsumerStatefulWidget {
  const USSDSessionsScreen({super.key});

  @override
  ConsumerState<USSDSessionsScreen> createState() => _USSDSessionsScreenState();
}

class _USSDSessionsScreenState extends ConsumerState<USSDSessionsScreen> {
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

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatAmount(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '\$');
    return format.format(amount);
  }

  String _formatDate(DateTime date) {
    return DateFormat('MMM dd, yyyy HH:mm').format(date);
  }

  Future<void> _showSessionDetails(USSDSession session) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Session Details', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('ID: ${session.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Phone Number: ${session.phoneNumber}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Service Code: ${session.serviceCode}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Status: ${session.status}', style: TextStyle(color: _getStatusColor(session.status))),
                Text('Amount: ${_formatAmount(session.amount, session.currency)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                Text('Created At: ${_formatDate(session.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9))),
                if (session.description != null) Text('Description: ${session.description}', style: const TextStyle(color: Color(0xFFf1f5f9))),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Close', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _updateSessionStatus(USSDSession session) async {
    // For simplicity, let's assume we can toggle between 'completed' and 'pending'
    final newStatus = session.status.toLowerCase() == 'completed' ? 'pending' : 'completed';
    try {
      await ref.read(apiServiceProvider).post(
        '/trpc/ussd.updateStatus',
        body: {'id': session.id, 'status': newStatus},
      );
      ref.invalidate(ussdSessionsProvider(_searchQuery)); // Refresh the list
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Session ${session.id} status updated to $newStatus')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update status: $e')),
      );
    }
  }

  Future<void> _deleteSession(USSDSession session) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Confirm Delete', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete session ${session.id}?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop(false);
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
              onPressed: () {
                Navigator.of(context).pop(true);
              },
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      try {
        await ref.read(apiServiceProvider).post(
          '/trpc/ussd.delete',
          body: {'id': session.id},
        );
        ref.invalidate(ussdSessionsProvider(_searchQuery)); // Refresh the list
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Session ${session.id} deleted successfully')),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete session: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ussdSessionsAsyncValue = ref.watch(ussdSessionsProvider(_searchQuery));

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text('USSD Sessions', style: TextStyle(color: Color(0xFFf1f5f9))), // Light text
        backgroundColor: const Color(0xFF1e293b), // Card color for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by phone number or service code...', 
                hintStyle: TextStyle(color: const Color(0xFFf1f5f9).withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: Color(0xFFf1f5f9)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFF1e293b), // Card color for search field
              ),
              style: const TextStyle(color: Color(0xFFf1f5f9)),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(ussdSessionsProvider(_searchQuery).future),
        child: ussdSessionsAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1))), // Accent color spinner
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Color(0xFFf1f5f9))),
          ),
          data: (sessions) {
            if (sessions.isEmpty) {
              return const Center(
                child: Text('No USSD sessions found.', style: TextStyle(color: Color(0xFFf1f5f9))),
              );
            }
            return ListView.builder(
              itemCount: sessions.length,
              itemBuilder: (context, index) {
                final session = sessions[index];
                return Card(
                  color: const Color(0xFF1e293b), // Card background
                  margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                  child: ListTile(
                    onTap: () => _showSessionDetails(session), // View details on tap
                    title: Text(session.phoneNumber, style: const TextStyle(color: Color(0xFFf1f5f9))), // Light text
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Service Code: ${session.serviceCode}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                        Text('Date: ${_formatDate(session.createdAt)}', style: const TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                        Row(
                          children: [
                            const Text('Status: ', style: TextStyle(color: Color(0xFFf1f5f9).withOpacity(0.7))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getStatusColor(session.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                session.status,
                                style: const TextStyle(color: Colors.white, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_formatAmount(session.amount, session.currency), style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold)),
                        IconButton(
                          icon: const Icon(Icons.edit, color: Color(0xFF6366f1)), // Accent color for edit button
                          onPressed: () => _updateSessionStatus(session),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.redAccent), // Red for delete
                          onPressed: () => _deleteSession(session),
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
