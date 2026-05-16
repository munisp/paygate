import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class PTSPSettlementScreen extends ConsumerStatefulWidget {
  const PTSPSettlementScreen({super.key});

  @override
  ConsumerState<PTSPSettlementScreen> createState() => _PTSPSettlementScreenState();
}

class _PTSPSettlementScreenState extends ConsumerState<PTSPSettlementScreen> {
  late Future<dynamic> _settlementsFuture;

  @override
  void initState() {
    super.initState();
    _fetchSettlements();
  }

  Future<void> _fetchSettlements() async {
    setState(() {
      _settlementsFuture = ref.read(apiServiceProvider).get('/trpc/ptspSettlement.list', params: {});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        title: const Text('PTSP Settlements', style: TextStyle(color: Color(0xFFf1f5f9))),
        backgroundColor: const Color(0xFF1e293b),
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchSettlements,
        color: const Color(0xFF6366f1),
        child: FutureBuilder<dynamic>(
          future: _settlementsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)));
            } else if (snapshot.hasError) {
              return Center(
                child: Text(
                  'Error: ${snapshot.error}',
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
              return const Center(
                child: Text(
                  'No settlements found.',
                  style: TextStyle(color: Color(0xFFf1f5f9)),
                ),
              );
            } else {
              final settlements = snapshot.data as List;
              return ListView.builder(
                itemCount: settlements.length,
                itemBuilder: (context, index) {
                  final settlement = settlements[index];
                  return Card(
                    color: const Color(0xFF1e293b),
                    margin: const EdgeInsets.all(8.0),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Settlement ID: ${settlement['id']}',
                            style: const TextStyle(color: Color(0xFFf1f5f9), fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8.0),
                          Text(
                            'Amount: ₦${_formatAmount(settlement['amount'])}',
                            style: const TextStyle(color: Color(0xFFf1f5f9)),
                          ),
                          const SizedBox(height: 8.0),
                          Text(
                            'Date: ${_formatDate(settlement['date'])}',
                            style: const TextStyle(color: Color(0xFFf1f5f9)),
                          ),
                          const SizedBox(height: 8.0),
                          _buildStatusBadge(settlement['status']),
                          const SizedBox(height: 16.0),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              ElevatedButton(
                                onPressed: () => _showEditDialog(settlement),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF6366f1),
                                  foregroundColor: const Color(0xFFf1f5f9),
                                ),
                                child: const Text('Edit'),
                              ),
                              const SizedBox(width: 8.0),
                              ElevatedButton(
                                onPressed: () => _showDeleteConfirmation(settlement['id']),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.red,
                                  foregroundColor: const Color(0xFFf1f5f9),
                                ),
                                child: const Text('Delete'),
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
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDialog,
        backgroundColor: const Color(0xFF6366f1),
        child: const Icon(Icons.add, color: Color(0xFFf1f5f9)),
      ),
    );
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
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 12.0),
      ),
    );
  }

  String _formatAmount(double amount) {
    return amount.toStringAsFixed(2); // Assuming Naira for now
  }

  String _formatDate(String dateString) {
    final dateTime = DateTime.parse(dateString);
    return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
  }

  void _showCreateDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Create Settlement', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Create form goes here', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () {
              // Implement create logic
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6366f1),
              foregroundColor: const Color(0xFFf1f5f9),
            ),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(dynamic settlement) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: Text('Edit Settlement ${settlement['id']}', style: const TextStyle(color: Color(0xFFf1f5f9))),
        content: const Text('Edit form goes here', style: TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () {
              // Implement edit logic
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6366f1),
              foregroundColor: const Color(0xFFf1f5f9),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(String id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
        content: Text('Are you sure you want to delete settlement $id?', style: const TextStyle(color: Color(0xFFf1f5f9))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF6366f1))),
          ),
          ElevatedButton(
            onPressed: () {
              // Implement delete logic
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: const Color(0xFFf1f5f9),
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}