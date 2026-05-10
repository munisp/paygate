import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

final billingPeriodProvider = StateProvider<String>((ref) => '30d');

final billingAnalyticsProvider = FutureProvider.autoDispose((ref) async {
  final period = ref.watch(billingPeriodProvider);
  // In production: call trpc.billingExt.getAnalytics via ApiService
  await Future.delayed(const Duration(milliseconds: 600));
  return _mockAnalytics(period);
});

Map<String, dynamic> _mockAnalytics(String period) {
  final multiplier = period == '7d' ? 0.25 : period == '30d' ? 1.0 : 3.0;
  return {
    'totalRevenueKobo': (12_500_000 * multiplier).round(),
    'platformShareKobo': (8_125_000 * multiplier).round(),
    'resellerShareKobo': (4_375_000 * multiplier).round(),
    'totalTransactions': (18_750 * multiplier).round(),
    'ebitdaKobo': (825_000 * multiplier).round(),
    'ebitdaMarginPct': 5.2,
    'avgFeeKobo': 667,
    'timeSeries': List.generate(
      period == '7d' ? 7 : period == '30d' ? 30 : 90,
      (i) => {
        'day': i + 1,
        'revenueKobo': (350_000 + (i % 7) * 50_000).round(),
        'transactions': 580 + (i % 5) * 40,
      },
    ),
  };
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class BillingAnalyticsScreen extends ConsumerWidget {
  const BillingAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(billingPeriodProvider);
    final analyticsAsync = ref.watch(billingAnalyticsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Billing Analytics',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          _PeriodSelector(current: period),
          const SizedBox(width: 8),
        ],
      ),
      body: analyticsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF6366F1)),
        ),
        error: (e, _) => Center(
          child: Text('Error: $e', style: const TextStyle(color: Colors.red)),
        ),
        data: (data) => _AnalyticsBody(data: data, period: period),
      ),
    );
  }
}

// ─── Period Selector ─────────────────────────────────────────────────────────

class _PeriodSelector extends ConsumerWidget {
  final String current;
  const _PeriodSelector({required this.current});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DropdownButton<String>(
      value: current,
      dropdownColor: const Color(0xFF1E293B),
      style: const TextStyle(color: Colors.white),
      underline: const SizedBox(),
      items: const [
        DropdownMenuItem(value: '7d', child: Text('7 days')),
        DropdownMenuItem(value: '30d', child: Text('30 days')),
        DropdownMenuItem(value: '90d', child: Text('90 days')),
      ],
      onChanged: (v) {
        if (v != null) ref.read(billingPeriodProvider.notifier).state = v;
      },
    );
  }
}

// ─── Analytics Body ──────────────────────────────────────────────────────────

class _AnalyticsBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final String period;
  const _AnalyticsBody({required this.data, required this.period});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0', 'en_NG');
    final revenueNgn = (data['totalRevenueKobo'] as int) / 100;
    final platformNgn = (data['platformShareKobo'] as int) / 100;
    final resellerNgn = (data['resellerShareKobo'] as int) / 100;
    final ebitdaNgn = (data['ebitdaKobo'] as int) / 100;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // KPI Cards
          Row(
            children: [
              Expanded(child: _KpiCard(
                label: 'Total Revenue',
                value: '₦${fmt.format(revenueNgn)}',
                icon: Icons.account_balance_wallet,
                color: const Color(0xFF6366F1),
              )),
              const SizedBox(width: 12),
              Expanded(child: _KpiCard(
                label: 'EBITDA',
                value: '₦${fmt.format(ebitdaNgn)}',
                icon: Icons.trending_up,
                color: const Color(0xFF10B981),
              )),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _KpiCard(
                label: 'Transactions',
                value: fmt.format(data['totalTransactions']),
                icon: Icons.receipt_long,
                color: const Color(0xFFF59E0B),
              )),
              const SizedBox(width: 12),
              Expanded(child: _KpiCard(
                label: 'EBITDA Margin',
                value: '${data['ebitdaMarginPct']}%',
                icon: Icons.pie_chart,
                color: const Color(0xFF8B5CF6),
              )),
            ],
          ),
          const SizedBox(height: 24),

          // Revenue Trend Chart
          const Text(
            'Revenue Trend',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            height: 200,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: _RevenueTrendChart(timeSeries: data['timeSeries'] as List),
          ),
          const SizedBox(height: 24),

          // Platform vs Reseller Split
          const Text(
            'Revenue Split',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                SizedBox(
                  height: 140,
                  width: 140,
                  child: PieChart(
                    PieChartData(
                      sections: [
                        PieChartSectionData(
                          value: platformNgn,
                          color: const Color(0xFF6366F1),
                          title: '65%',
                          titleStyle: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        PieChartSectionData(
                          value: resellerNgn,
                          color: const Color(0xFF10B981),
                          title: '35%',
                          titleStyle: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                      sectionsSpace: 2,
                    ),
                  ),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _LegendItem(
                        color: const Color(0xFF6366F1),
                        label: 'Platform (65%)',
                        value: '₦${fmt.format(platformNgn)}',
                      ),
                      const SizedBox(height: 12),
                      _LegendItem(
                        color: const Color(0xFF10B981),
                        label: 'Reseller (35%)',
                        value: '₦${fmt.format(resellerNgn)}',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

// ─── Revenue Trend Chart ─────────────────────────────────────────────────────

class _RevenueTrendChart extends StatelessWidget {
  final List timeSeries;
  const _RevenueTrendChart({required this.timeSeries});

  @override
  Widget build(BuildContext context) {
    final spots = timeSeries.asMap().entries.map((e) {
      final revenue = (e.value['revenueKobo'] as int) / 100;
      return FlSpot(e.key.toDouble(), revenue / 1000); // in thousands NGN
    }).toList();

    return LineChart(
      LineChartData(
        gridData: FlGridData(
          show: true,
          getDrawingHorizontalLine: (_) => FlLine(
            color: Colors.white.withOpacity(0.05),
            strokeWidth: 1,
          ),
          getDrawingVerticalLine: (_) => FlLine(
            color: Colors.white.withOpacity(0.05),
            strokeWidth: 1,
          ),
        ),
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (v, _) => Text(
                '₦${v.toStringAsFixed(0)}K',
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 10),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: false,
            ),
          ),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: const Color(0xFF6366F1),
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: const Color(0xFF6366F1).withOpacity(0.1),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Legend Item ─────────────────────────────────────────────────────────────

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  final String value;

  const _LegendItem({
    required this.color,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
              Text(value,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ],
    );
  }
}
