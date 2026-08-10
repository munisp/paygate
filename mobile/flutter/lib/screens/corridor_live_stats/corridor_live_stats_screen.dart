import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart'; // Assuming this path is correct

// Define the data model for live statistics
class LiveStat {
  final String id;
  final String corridorName;
  final double volume;
  final String currency;
  final String status;
  final DateTime lastUpdated;

  LiveStat({
    required this.id,
    required this.corridorName,
    required this.volume,
    required this.currency,
    required this.status,
    required this.lastUpdated,
  });

  factory LiveStat.fromJson(Map<String, dynamic> json) {
    return LiveStat(
      id: json['id'],
      corridorName: json['corridorName'],
      volume: (json['volume'] as num).toDouble(),
      currency: json['currency'],
      status: json['status'],
      lastUpdated: DateTime.parse(json['lastUpdated']),
    );
  }
}

// Placeholder for the tRPC router and procedure
// Assuming 'corridor.liveStats' is the tRPC router namespace for CorridorLiveStats
final liveStatsProvider = FutureProvider.family<List<LiveStat>, String>((ref, query) async {
  final api = ref.read(apiServiceProvider);
  // In a real scenario, you would make a tRPC call like:
  // final response = await api.get('/trpc/corridor.liveStats', params: {'query': query});
  // return (response as List).map((e) => LiveStat.fromJson(e)).toList();

  // Mock data for demonstration
  await Future.delayed(const Duration(seconds: 1)); // Simulate network delay
  if (query == 'error') {
    throw Exception('Failed to load live stats');
  }
  if (query == 'empty') {
    return [];
  }
  return [
    LiveStat(id: '1', corridorName: 'NGN-USD', volume: 150000.50, currency: 'USD', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(minutes: 5))),
    LiveStat(id: '2', corridorName: 'GHS-EUR', volume: 2500.75, currency: 'EUR', status: 'Inactive', lastUpdated: DateTime.now().subtract(const Duration(hours: 1))),
    LiveStat(id: '3', corridorName: 'KES-GBP', volume: 75000.00, currency: 'GBP', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(days: 1))),
    LiveStat(id: '4', corridorName: 'ZAR-USD', volume: 300000.20, currency: 'USD', status: 'Active', lastUpdated: DateTime.now().subtract(const Duration(minutes: 30))),
  ];
});

class CorridorLiveStatsScreen extends ConsumerStatefulWidget {
  const CorridorLiveStatsScreen({super.key});

  @override
  ConsumerState<CorridorLiveStatsScreen> createState() => _CorridorLiveStatsScreenState();
}

class _CorridorLiveStatsScreenState extends ConsumerState<CorridorLiveStatsScreen> {
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
    ref.invalidate(liveStatsProvider(_searchQuery));
    await ref.read(liveStatsProvider(_searchQuery).future);
  }

  String _formatAmount(double amount, String currency) {
    final symbol = currency == 'USD' ? '$' : (currency == 'NGN' ? '₦' : currency);
    return '$symbol${amount.toStringAsFixed(2)}'; // Default to USD formatting for simplicity
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'Active':
        color = Colors.green;
        break;
      case 'Inactive':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child:
          Text(status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final liveStatsAsyncValue = ref.watch(liveStatsProvider(_searchQuery));

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: const Text('Corridor Live Stats', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: accentColor,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: textColor),
                decoration: InputDecoration(
                  hintText: 'Search corridors...',
                  hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: textColor),
                  filled: true,
                  fillColor: cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: liveStatsAsyncValue.when(
                data: (stats) {
                  if (stats.isEmpty) {
                    return const Center(
                      child: Text('No live stats available.', style: TextStyle(color: textColor)),
                    );
                  }
                  return ListView.builder(
                    itemCount: stats.length,
                    itemBuilder: (context, index) {
                      final stat = stats[index];
                      return Card(
                        color: cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(stat.corridorName, style: const TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text('Volume: ${_formatAmount(stat.volume, stat.currency)}', style: const TextStyle(color: textColor)),
                                  _buildStatusBadge(stat.status),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('Last Updated: ${stat.lastUpdated.toLocal().toString().split('.')[0]}', style: TextStyle(color: textColor.withOpacity(0.7), fontSize: 12)),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
                error: (err, stack) => Center(
                  child: Text('Error: $err', style: const TextStyle(color: Colors.red)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
