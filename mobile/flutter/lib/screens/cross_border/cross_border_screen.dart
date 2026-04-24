import 'package:flutter/material.dart';

class CrossBorderScreen extends StatefulWidget {
  const CrossBorderScreen({super.key});
  @override
  State<CrossBorderScreen> createState() => _CrossBorderScreenState();
}

class _CrossBorderScreenState extends State<CrossBorderScreen> {
  String _selectedRail = 'all';
  String _selectedStatus = 'all';
  final _searchController = TextEditingController();

  final _rails = ['all', 'CIPS', 'UPI', 'PIX', 'SWIFT', 'SEPA'];
  final _statuses = ['all', 'pending', 'processing', 'completed', 'failed'];

  final _transfers = [
    {'id': 'CB-001', 'rail': 'CIPS', 'amount': 50000.0, 'currency': 'CNY', 'status': 'completed', 'recipient': 'Bank of China'},
    {'id': 'CB-002', 'rail': 'UPI', 'amount': 100000.0, 'currency': 'INR', 'status': 'processing', 'recipient': 'HDFC Bank'},
    {'id': 'CB-003', 'rail': 'PIX', 'amount': 2500.0, 'currency': 'BRL', 'status': 'completed', 'recipient': 'Itaú Unibanco'},
    {'id': 'CB-004', 'rail': 'SWIFT', 'amount': 10000.0, 'currency': 'USD', 'status': 'pending', 'recipient': 'JP Morgan'},
  ];

  Color _railColor(String rail) {
    switch (rail) {
      case 'CIPS': return Colors.red;
      case 'UPI': return Colors.purple;
      case 'PIX': return Colors.green;
      case 'SWIFT': return Colors.blue;
      case 'SEPA': return Colors.cyan;
      default: return Colors.grey;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'completed': return Colors.green;
      case 'processing': return Colors.blue;
      case 'pending': return Colors.orange;
      case 'failed': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _transfers.where((t) {
      final matchRail = _selectedRail == 'all' || t['rail'] == _selectedRail;
      final matchStatus = _selectedStatus == 'all' || t['status'] == _selectedStatus;
      final q = _searchController.text.toLowerCase();
      final matchSearch = q.isEmpty || (t['id'] as String).toLowerCase().contains(q) || (t['recipient'] as String).toLowerCase().contains(q);
      return matchRail && matchStatus && matchSearch;
    }).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Cross-Border Transfers'), backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by ID or recipient...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: _rails.map((r) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(r.toUpperCase()),
                  selected: _selectedRail == r,
                  onSelected: (_) => setState(() => _selectedRail = r),
                  selectedColor: const Color(0xFF6366F1),
                  labelStyle: TextStyle(color: _selectedRail == r ? Colors.white : null, fontSize: 12),
                ),
              )).toList(),
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: _statuses.map((s) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(s),
                  selected: _selectedStatus == s,
                  onSelected: (_) => setState(() => _selectedStatus = s),
                  selectedColor: const Color(0xFF6366F1),
                  labelStyle: TextStyle(color: _selectedStatus == s ? Colors.white : null, fontSize: 12),
                ),
              )).toList(),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: filtered.length,
              itemBuilder: (ctx, i) {
                final t = filtered[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: _railColor(t['rail'] as String).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: _railColor(t['rail'] as String)),
                              ),
                              child: Text(t['rail'] as String, style: TextStyle(color: _railColor(t['rail'] as String), fontWeight: FontWeight.w700, fontSize: 11)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: _statusColor(t['status'] as String).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(t['status'] as String, style: TextStyle(color: _statusColor(t['status'] as String), fontWeight: FontWeight.w600, fontSize: 11)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(t['id'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        Text(t['recipient'] as String, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        const SizedBox(height: 6),
                        Text('${(t['amount'] as double).toStringAsFixed(0)} ${t['currency']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('New transfer coming soon'))),
        label: const Text('New Transfer'),
        icon: const Icon(Icons.send),
        backgroundColor: const Color(0xFF6366F1),
      ),
    );
  }
}
