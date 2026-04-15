import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

// Note: In a real project, these would be imported from their respective files.
// For the purpose of this task, they are included as placeholders or mocks.
// import 'package:paygate/services/api_service.dart';
// import 'package:paygate/providers/api_provider.dart';

// --- Providers ---

final selectedPeriodProvider = StateProvider<String>((ref) => '30d');

final analyticsProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiServiceProvider);
  final period = ref.watch(selectedPeriodProvider);
  return api.getAnalytics(period);
});

final channelBreakdownProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiServiceProvider);
  final period = ref.watch(selectedPeriodProvider);
  return api.getChannelBreakdown(period);
});

// Placeholder for the actual ApiService provider
final apiServiceProvider = Provider((ref) => ApiService());

// --- Models & Service Mock ---

class ApiService {
  Future<AnalyticsData> getAnalytics(String period) async {
    // Simulate API call
    await Future.delayed(const Duration(seconds: 1));
    return AnalyticsData.mock(period);
  }

  Future<List<ChannelData>> getChannelBreakdown(String period) async {
    // Simulate API call
    await Future.delayed(const Duration(milliseconds: 800));
    return [
      ChannelData('Card', 65, const Color(0xFF3B82F6)),
      ChannelData('Bank Transfer', 20, const Color(0xFF10B981)),
      ChannelData('E-Wallet', 15, const Color(0xFFF59E0B)),
    ];
  }
}

class AnalyticsData {
  final double totalVolume;
  final double avgTransactionValue;
  final double successRate;
  final List<FlSpot> revenueTrend;
  final List<CustomerData> topCustomers;

  AnalyticsData({
    required this.totalVolume,
    required this.avgTransactionValue,
    required this.successRate,
    required this.revenueTrend,
    required this.topCustomers,
  });

  factory AnalyticsData.mock(String period) {
    return AnalyticsData(
      totalVolume: 125430.50,
      avgTransactionValue: 85.20,
      successRate: 0.985,
      revenueTrend: [
        const FlSpot(0, 3000),
        const FlSpot(1, 4500),
        const FlSpot(2, 3800),
        const FlSpot(3, 6000),
        const FlSpot(4, 5200),
        const FlSpot(5, 7500),
        const FlSpot(6, 8200),
      ],
      topCustomers: [
        CustomerData('Acme Corp', 12500.00, 145),
        CustomerData('Global Tech', 9800.50, 88),
        CustomerData('Starlight Inc', 7200.00, 52),
        CustomerData('Nexus Solutions', 5400.25, 41),
        CustomerData('Cloud Nine', 4100.00, 33),
      ],
    );
  }
}

class ChannelData {
  final String name;
  final double value;
  final Color color;
  ChannelData(this.name, this.value, this.color);
}

class CustomerData {
  final String name;
  final double volume;
  final int transactions;
  CustomerData(this.name, this.volume, this.transactions);
}

// --- Screen Implementation ---

class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  // Theme Constants
  static const Color bgColor = Color(0xFF0F172A);
  static const Color surfaceColor = Color(0xFF1E293B);
  static const Color borderColor = Color(0xFF334155);
  static const Color primaryColor = Color(0xFF3B82F6);
  static const Color textColor = Color(0xFFF1F5F9);
  static const Color mutedColor = Color(0xFF94A3B8);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analyticsAsync = ref.watch(analyticsProvider);
    final channelAsync = ref.watch(channelBreakdownProvider);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        title: const Text(
          'Analytics Dashboard',
          style: TextStyle(color: textColor, fontWeight: FontWeight.bold, fontSize: 20),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: textColor),
            onPressed: () {
              ref.invalidate(analyticsProvider);
              ref.invalidate(channelBreakdownProvider);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        color: primaryColor,
        backgroundColor: surfaceColor,
        onRefresh: () async {
          ref.invalidate(analyticsProvider);
          ref.invalidate(channelBreakdownProvider);
        },
        child: analyticsAsync.when(
          data: (data) => _buildContent(context, ref, data, channelAsync),
          loading: () => const Center(child: CircularProgressIndicator(color: primaryColor)),
          error: (err, stack) => _buildErrorState(err, ref),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, AnalyticsData data, AsyncValue<List<ChannelData>> channelAsync) {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildPeriodSelector(ref),
          const SizedBox(height: 24),
          _buildMetricsGrid(data),
          const SizedBox(height: 24),
          _buildSectionHeader('Revenue Trend', 'Performance over time'),
          const SizedBox(height: 16),
          _buildRevenueChart(data.revenueTrend),
          const SizedBox(height: 24),
          _buildSectionHeader('Channel Breakdown', 'Transaction distribution'),
          const SizedBox(height: 16),
          channelAsync.when(
            data: (channels) => _buildChannelPieChart(channels),
            loading: () => const SizedBox(height: 150, child: Center(child: CircularProgressIndicator(color: primaryColor))),
            error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader('Top Customers', 'Highest volume contributors'),
          const SizedBox(height: 16),
          _buildTopCustomersList(data.topCustomers),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildPeriodSelector(WidgetRef ref) {
    final periods = ['7d', '30d', '90d', '1y'];
    final selected = ref.watch(selectedPeriodProvider);

    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: periods.map((p) {
          final isSelected = selected == p;
          return Expanded(
            child: GestureDetector(
              onTap: () => ref.read(selectedPeriodProvider.notifier).state = p,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected ? primaryColor : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  p.toUpperCase(),
                  style: TextStyle(
                    color: isSelected ? Colors.white : mutedColor,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildMetricsGrid(AnalyticsData data) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.4,
      children: [
        _buildMetricCard(
          'Total Volume', 
          NumberFormat.compactCurrency(symbol: '$').format(data.totalVolume), 
          Icons.account_balance_wallet_outlined,
          '+12.5%',
        ),
        _buildMetricCard(
          'Avg. Transaction', 
          NumberFormat.currency(symbol: '$').format(data.avgTransactionValue), 
          Icons.trending_up_rounded,
          '+2.3%',
        ),
        _buildMetricCard(
          'Success Rate', 
          '${(data.successRate * 100).toStringAsFixed(1)}%', 
          Icons.check_circle_outline_rounded,
          'Stable',
        ),
        _buildMetricCard(
          'Active Users', 
          '1,240', 
          Icons.people_outline_rounded,
          '+5.1%',
        ),
      ],
    );
  }

  Widget _buildMetricCard(String title, String value, IconData icon, String trend) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, size: 20, color: primaryColor),
              Text(
                trend,
                style: TextStyle(
                  color: trend.startsWith('+') ? Colors.greenAccent : mutedColor,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const Spacer(),
          Text(title, style: const TextStyle(color: mutedColor, fontSize: 12)),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        Text(
          subtitle,
          style: const TextStyle(color: mutedColor, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildRevenueChart(List<FlSpot> spots) {
    return Container(
      height: 220,
      padding: const EdgeInsets.only(right: 20, top: 24, bottom: 12, left: 8),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: LineChart(
        LineChartData(
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (value) => FlLine(
              color: borderColor.withOpacity(0.3),
              strokeWidth: 1,
            ),
          ),
          titlesData: FlTitlesData(
            show: true,
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 22,
                interval: 1,
                getTitlesWidget: (value, meta) {
                  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  if (value.toInt() >= 0 && value.toInt() < days.length) {
                    return Text(days[value.toInt()], style: const TextStyle(color: mutedColor, fontSize: 10));
                  }
                  return const Text('');
                },
              ),
            ),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                interval: 2000,
                getTitlesWidget: (value, meta) {
                  return Text(
                    '${(value / 1000).toInt()}k',
                    style: const TextStyle(color: mutedColor, fontSize: 10),
                  );
                },
                reservedSize: 28,
              ),
            ),
          ),
          borderData: FlBorderData(show: false),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              color: primaryColor,
              barWidth: 4,
              isStrokeCapRound: true,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  colors: [primaryColor.withOpacity(0.3), primaryColor.withOpacity(0.0)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChannelPieChart(List<ChannelData> channels) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          SizedBox(
            height: 140,
            width: 140,
            child: PieChart(
              PieChartData(
                sectionsSpace: 4,
                centerSpaceRadius: 35,
                sections: channels.map((c) {
                  return PieChartSectionData(
                    color: c.color,
                    value: c.value,
                    title: '${c.value.toInt()}%',
                    radius: 25,
                    titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(width: 32),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: channels.map((c) => _buildLegendItem(c)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLegendItem(ChannelData data) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: data.color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              data.name,
              style: const TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w400),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopCustomersList(List<CustomerData> customers) {
    if (customers.isEmpty) {
      return _buildEmptyState('No customer data found');
    }
    return Container(
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: customers.length,
        separatorBuilder: (context, index) => Divider(color: borderColor.withOpacity(0.5), height: 1),
        itemBuilder: (context, index) {
          final customer = customers[index];
          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: CircleAvatar(
              backgroundColor: primaryColor.withOpacity(0.1),
              child: Text(
                customer.name[0],
                style: const TextStyle(color: primaryColor, fontWeight: FontWeight.bold),
              ),
            ),
            title: Text(customer.name, style: const TextStyle(color: textColor, fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Text('${customer.transactions} transactions', style: const TextStyle(color: mutedColor, fontSize: 12)),
            trailing: Text(
              NumberFormat.currency(symbol: '$').format(customer.volume),
              style: const TextStyle(color: textColor, fontWeight: FontWeight.bold, fontSize: 14),
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          children: [
            Icon(Icons.analytics_outlined, color: mutedColor.withOpacity(0.5), size: 48),
            const SizedBox(height: 16),
            Text(message, style: const TextStyle(color: mutedColor)),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(Object error, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 64),
            const SizedBox(height: 24),
            const Text(
              'Something went wrong',
              style: TextStyle(color: textColor, fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'We couldn\'t load your analytics data. Please try again.',
              style: TextStyle(color: mutedColor, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  ref.invalidate(analyticsProvider);
                  ref.invalidate(channelBreakdownProvider);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: const Text('Retry Connection', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
