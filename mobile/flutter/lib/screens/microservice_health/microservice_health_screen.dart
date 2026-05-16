import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart'; // For date formatting
import '../../services/api_service.dart';

// Data model for Microservice Health
class MicroserviceHealth {
  final String name;
  final String status;
  final DateTime lastChecked;
  final String message;

  MicroserviceHealth({
    required this.name,
    required this.status,
    required this.lastChecked,
    required this.message,
  });

  factory MicroserviceHealth.fromJson(Map<String, dynamic> json) {
    return MicroserviceHealth(
      name: json['name'],
      status: json['status'],
      lastChecked: DateTime.parse(json['lastChecked']),
      message: json['message'],
    );
  }
}

// Riverpod FutureProvider for fetching microservice health data
final microserviceHealthProvider = FutureProvider.autoDispose<List<MicroserviceHealth>>((ref) async {
  try {
    final response = await ref.read(apiServiceProvider).get(
      '/trpc/health.getMicroserviceHealth',
      params: {},
    );
    
    if (response.data == null || (response.data as List).isEmpty) {
      return [];
    }

    return (response.data as List)
        .map((item) => MicroserviceHealth.fromJson(item as Map<String, dynamic>))
        .toList();
  } catch (e) {
    throw Exception('Failed to load microservice health: $e');
  }
});

class MicroserviceHealthScreen extends ConsumerStatefulWidget {
  const MicroserviceHealthScreen({super.key});

  @override
  ConsumerState<MicroserviceHealthScreen> createState() => _MicroserviceHealthScreenState();
}

class _MicroserviceHealthScreenState extends ConsumerState<MicroserviceHealthScreen> {
  // Define dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  String _formatDateTime(DateTime dateTime) {
    return DateFormat('yyyy-MM-dd HH:mm:ss').format(dateTime.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final healthAsyncValue = ref.watch(microserviceHealthProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Microservice Health', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(microserviceHealthProvider.future),
        child: healthAsyncValue.when(
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent)),
          ),
          data: (healthList) {
            if (healthList.isEmpty) {
              return Center(
                child: Text(
                  'No microservice health data available.',
                  style: TextStyle(color: _textColor),
                ),
              );
            }
            return ListView.builder(
              itemCount: healthList.length,
              itemBuilder: (context, index) {
                final health = healthList[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          health.name,
                          style: TextStyle(color: _textColor, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text('Status: ',
                                style: TextStyle(color: _textColor.withOpacity(0.7))),
                            _buildStatusBadge(health.status),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text('Last Checked: ${_formatDateTime(health.lastChecked)}',
                            style: TextStyle(color: _textColor.withOpacity(0.7))),
                        const SizedBox(height: 4),
                        Text('Message: ${health.message}',
                            style: TextStyle(color: _textColor.withOpacity(0.7))),
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

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;
    switch (status.toLowerCase()) {
      case 'healthy':
        badgeColor = Colors.green;
        break;
      case 'degraded':
        badgeColor = Colors.orange;
        break;
      case 'unhealthy':
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
        style: TextStyle(color: textColor, fontWeight: FontWeight.bold),
      ),
    );
  }
}