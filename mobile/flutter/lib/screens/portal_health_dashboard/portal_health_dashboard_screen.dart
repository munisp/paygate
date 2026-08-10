import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

// Assuming a data structure for health dashboard metrics
class HealthDashboardData {
  final String status;
  final double dailyRevenue;
  final int activeUsers;
  final DateTime lastUpdated;
  final String currency;

  HealthDashboardData({
    required this.status,
    required this.dailyRevenue,
    required this.activeUsers,
    required this.lastUpdated,
    required this.currency,
  });

  factory HealthDashboardData.fromJson(Map<String, dynamic> json) {
    return HealthDashboardData(
      status: json['status'] as String,
      dailyRevenue: (json['dailyRevenue'] as num).toDouble(),
      activeUsers: json['activeUsers'] as int,
      lastUpdated: DateTime.parse(json['lastUpdated'] as String),
      currency: json['currency'] as String? ?? 'USD', // Default to USD if not provided
    );
  }
}

// Riverpod provider for fetching health dashboard data
final healthDashboardProvider = FutureProvider<HealthDashboardData>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/health.dashboard');
  return HealthDashboardData.fromJson(response as Map<String, dynamic>);
});

class PortalHealthDashboardScreen extends ConsumerStatefulWidget {
  const PortalHealthDashboardScreen({super.key});

  @override
  ConsumerState<PortalHealthDashboardScreen> createState() => _PortalHealthDashboardScreenState();
}

class _PortalHealthDashboardScreenState extends ConsumerState<PortalHealthDashboardScreen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);
  static const Color _successColor = Colors.green;
  static const Color _warningColor = Colors.orange;
  static const Color _errorColor = Colors.red;

  Future<void> _refreshData() async {
    ref.invalidate(healthDashboardProvider);
  }

  String _formatCurrency(double amount, String currency) {
    final format = NumberFormat.currency(locale: 'en_US', symbol: currency == 'NGN' ? '₦' : '$');
    return format.format(amount);
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    IconData badgeIcon;
    switch (status.toLowerCase()) {
      case 'operational':
        badgeColor = _successColor;
        badgeIcon = Icons.check_circle;
        break;
      case 'degraded':
        badgeColor = _warningColor;
        badgeIcon = Icons.warning;
        break;
      case 'outage':
        badgeColor = _errorColor;
        badgeIcon = Icons.error;
        break;
      default:
        badgeColor = Colors.grey;
        badgeIcon = Icons.info;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(badgeIcon, color: badgeColor, size: 16),
          const SizedBox(width: 4),
          Text(status, style: TextStyle(color: badgeColor, fontSize: 12)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final healthDashboardAsyncValue = ref.watch(healthDashboardProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Portal Health Dashboard', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: _textColor),
            onPressed: _refreshData,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: _accentColor,
        child: healthDashboardAsyncValue.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: _accentColor),
          ),
          error: (err, stack) => Center(
            child: Text('Error: $err', style: const TextStyle(color: _errorColor)),
          ),
          data: (data) {
            if (data == null) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.info_outline, color: _textColor, size: 48),
                    const SizedBox(height: 16),
                    const Text('No health data available.', style: TextStyle(color: _textColor, fontSize: 18)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _refreshData,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Refresh'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _accentColor,
                        foregroundColor: _textColor,
                      ),
                    ),
                  ],
                ),
              );
            }
            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Card(
                      color: _cardColor,
                      margin: const EdgeInsets.only(bottom: 16.0),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('System Status', style: TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold)),
                                _buildStatusBadge(data.status),
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Last Updated: ${DateFormat('MMM d, yyyy - hh:mm a').format(data.lastUpdated.toLocal())}',
                              style: TextStyle(color: _textColor.withOpacity(0.7), fontSize: 14),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Card(
                      color: _cardColor,
                      margin: const EdgeInsets.only(bottom: 16.0),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Key Metrics', style: TextStyle(color: _textColor, fontSize: 20, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 16),
                            _buildMetricRow('Daily Revenue', _formatCurrency(data.dailyRevenue, data.currency), Icons.monetization_on),
                            const Divider(color: _textColor, height: 32),
                            _buildMetricRow('Active Users', data.activeUsers.toString(), Icons.people),
                          ],
                        ),
                      ),
                    ),
                    // Example Action Button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          // Handle action, e.g., navigate to logs
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Viewing System Logs')),
                          );
                        },
                        icon: const Icon(Icons.analytics_outlined),
                        label: const Text('View System Logs'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accentColor,
                          foregroundColor: _textColor,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          textStyle: const TextStyle(fontSize: 16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildMetricRow(String title, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Icon(icon, color: _accentColor, size: 24),
          const SizedBox(width: 16),
          Expanded(
            child: Text(title, style: const TextStyle(color: _textColor, fontSize: 16)),
          ),
          Text(value, style: const TextStyle(color: _textColor, fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
