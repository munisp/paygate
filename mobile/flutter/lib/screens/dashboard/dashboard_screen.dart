import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:shimmer/shimmer.dart';
import 'package:intl/intl.dart';

// --- Theme Constants (Material 3 Dark Theme) ---
const Color kBgColor = Color(0xFF0F172A);
const Color kSurfaceColor = Color(0xFF1E293B);
const Color kBorderColor = Color(0xFF334155);
const Color kPrimaryColor = Color(0xFF3B82F6);
const Color kTextColor = Color(0xFFF1F5F9);
const Color kMutedColor = Color(0xFF94A3B8);

// --- Models (Assuming these are defined in the project) ---
class DashboardStats {
  final double totalRevenue;
  final int transactions;
  final double successRate;
  final double pendingPayouts;

  DashboardStats({
    required this.totalRevenue,
    required this.transactions,
    required this.successRate,
    required this.pendingPayouts,
  });
}

class Transaction {
  final String id;
  final String title;
  final double amount;
  final DateTime date;
  final String status;

  Transaction({
    required this.id,
    required this.title,
    required this.amount,
    required this.date,
    required this.status,
  });
}

// --- API Service & Providers ---
// Note: In a real app, ApiService would be imported from lib/services/api_service.dart
// and apiServiceProvider would be defined there.
abstract class IApiService {
  Future<DashboardStats> getDashboardStats();
  Future<List<FlSpot>> getRevenueChart(String period);
  Future<List<Transaction>> getRecentTransactions();
}

// Mock implementation for demonstration; in production, this would be the real ApiService
final apiServiceProvider = Provider<IApiService>((ref) => throw UnimplementedError());

final dashboardStatsProvider = FutureProvider<DashboardStats>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.getDashboardStats();
});

final revenueChartProvider = FutureProvider.family<List<FlSpot>, String>((ref, period) async {
  final api = ref.watch(apiServiceProvider);
  return api.getRevenueChart(period);
});

final recentTransactionsProvider = FutureProvider<List<Transaction>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.getRecentTransactions();
});

// --- Dashboard Screen ---
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  Future<void> _onRefresh() async {
    // Invalidate all providers to trigger a fresh fetch
    ref.invalidate(dashboardStatsProvider);
    ref.invalidate(revenueChartProvider('7d'));
    ref.invalidate(recentTransactionsProvider);
    
    // Wait for the main stats to complete
    try {
      await ref.read(dashboardStatsProvider.future);
    } catch (_) {
      // Errors are handled by the .when() builders in the UI
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBgColor,
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        color: kPrimaryColor,
        backgroundColor: kSurfaceColor,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            _buildHeader(),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildStatCardsSection(),
                    const SizedBox(height: 24),
                    _buildQuickActionsSection(),
                    const SizedBox(height: 24),
                    _buildRevenueChartSection(),
                    const SizedBox(height: 24),
                    _buildRecentTransactionsSection(),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return SliverAppBar(
      expandedHeight: 100,
      floating: false,
      pinned: true,
      backgroundColor: kBgColor,
      elevation: 0,
      flexibleSpace: FlexibleSpaceBar(
        titlePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        centerTitle: false,
        title: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Welcome back,',
              style: TextStyle(
                color: kMutedColor,
                fontSize: 12,
                fontWeight: FontWeight.w400,
              ),
            ),
            const Text(
              'Acme Corp Merchant',
              style: TextStyle(
                color: kTextColor,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.notifications_none, color: kTextColor),
          onPressed: () {},
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  Widget _buildStatCardsSection() {
    final statsAsync = ref.watch(dashboardStatsProvider);

    return statsAsync.when(
      data: (stats) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.4,
        children: [
          _StatCard(
            title: 'Total Revenue',
            value: '\$${NumberFormat('#,###.##').format(stats.totalRevenue)}',
            icon: Icons.account_balance_wallet,
            trend: '+12.5%',
          ),
          _StatCard(
            title: 'Transactions',
            value: stats.transactions.toString(),
            icon: Icons.swap_horiz,
            trend: '+5.2%',
          ),
          _StatCard(
            title: 'Success Rate',
            value: '${stats.successRate}%',
            icon: Icons.check_circle_outline,
          ),
          _StatCard(
            title: 'Pending Payouts',
            value: '\$${NumberFormat('#,###.##').format(stats.pendingPayouts)}',
            icon: Icons.timer_outlined,
          ),
        ],
      ),
      loading: () => _buildShimmerStats(),
      error: (err, stack) => _buildErrorState('Failed to load dashboard stats'),
    );
  }

  Widget _buildShimmerStats() {
    return Shimmer.fromColors(
      baseColor: kSurfaceColor,
      highlightColor: kBorderColor,
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.4,
        children: List.generate(4, (index) => Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
        )),
      ),
    );
  }

  Widget _buildQuickActionsSection() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _QuickActionButton(icon: Icons.send, label: 'Send', color: Colors.blue),
        _QuickActionButton(icon: Icons.add, label: 'Request', color: Colors.green),
        _QuickActionButton(icon: Icons.credit_card, label: 'Card', color: Colors.orange),
        _QuickActionButton(icon: Icons.analytics, label: 'Analytics', color: Colors.purple),
      ],
    );
  }

  Widget _buildRevenueChartSection() {
    final chartAsync = ref.watch(revenueChartProvider('7d'));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kSurfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kBorderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Revenue (Last 7 Days)',
                style: TextStyle(color: kTextColor, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: kBgColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '7D',
                  style: TextStyle(color: kPrimaryColor, fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 180,
            child: chartAsync.when(
              data: (spots) => LineChart(
                LineChartData(
                  gridData: const FlGridData(show: false),
                  titlesData: const FlTitlesData(show: false),
                  borderData: FlBorderData(show: false),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      color: kPrimaryColor,
                      barWidth: 3,
                      isStrokeCapRound: true,
                      dotData: const FlDotData(show: false),
                      belowBarData: BarAreaData(
                        show: true,
                        color: kPrimaryColor.withOpacity(0.1),
                      ),
                    ),
                  ],
                ),
              ),
              loading: () => const Center(child: CircularProgressIndicator(color: kPrimaryColor)),
              error: (err, stack) => const Center(
                child: Text('Unable to load chart data', style: TextStyle(color: kMutedColor)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentTransactionsSection() {
    final transactionsAsync = ref.watch(recentTransactionsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Recent Transactions',
              style: TextStyle(color: kTextColor, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            TextButton(
              onPressed: () {},
              child: const Text('See All', style: TextStyle(color: kPrimaryColor)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        transactionsAsync.when(
          data: (transactions) {
            if (transactions.isEmpty) {
              return _buildEmptyState('No recent transactions found');
            }
            return ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: transactions.length,
              separatorBuilder: (context, index) => Divider(color: kBorderColor, height: 1),
              itemBuilder: (context, index) {
                final tx = transactions[index];
                final isPositive = tx.amount > 0;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: kSurfaceColor,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      isPositive ? Icons.arrow_downward : Icons.arrow_upward,
                      color: isPositive ? Colors.green : Colors.red,
                      size: 18,
                    ),
                  ),
                  title: Text(
                    tx.title,
                    style: const TextStyle(color: kTextColor, fontWeight: FontWeight.w500, fontSize: 14),
                  ),
                  subtitle: Text(
                    DateFormat('MMM dd, hh:mm a').format(tx.date),
                    style: const TextStyle(color: kMutedColor, fontSize: 12),
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${isPositive ? '+' : ''}\$${tx.amount.abs().toStringAsFixed(2)}',
                        style: TextStyle(
                          color: isPositive ? Colors.green : kTextColor,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        tx.status,
                        style: TextStyle(
                          color: tx.status == 'Success' ? Colors.green : Colors.orange,
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
          loading: () => _buildShimmerTransactions(),
          error: (err, stack) => _buildErrorState('Failed to load transactions'),
        ),
      ],
    );
  }

  Widget _buildShimmerTransactions() {
    return Shimmer.fromColors(
      baseColor: kSurfaceColor,
      highlightColor: kBorderColor,
      child: Column(
        children: List.generate(3, (index) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Container(width: 40, height: 40, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10))),
          title: Container(height: 12, width: 120, color: Colors.white),
          subtitle: Container(height: 8, width: 80, color: Colors.white),
        )),
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            Icon(Icons.inbox_outlined, size: 48, color: kMutedColor.withOpacity(0.5)),
            const SizedBox(height: 16),
            Text(message, style: const TextStyle(color: kMutedColor)),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent, size: 32),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: kMutedColor)),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _onRefresh,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Try Again'),
              style: TextButton.styleFrom(foregroundColor: kPrimaryColor),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Helper Widgets ---

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final String? trend;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    this.trend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kSurfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kBorderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: kPrimaryColor, size: 20),
              if (trend != null)
                Text(
                  trend!,
                  style: const TextStyle(color: Colors.green, fontSize: 10, fontWeight: FontWeight.bold),
                ),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(color: kMutedColor, fontSize: 11),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  value,
                  style: const TextStyle(color: kTextColor, fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {},
      borderRadius: BorderRadius.circular(16),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(color: kTextColor, fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
