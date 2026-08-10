import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

// Assuming these exist in the project structure
// import 'package:paygate_merchant/services/api_service.dart';
// import 'package:paygate_merchant/models/transaction.dart';
// import 'package:paygate_merchant/providers/api_provider.dart';

/// Mock models and providers to make the file self-contained as requested
/// In a real app, these would be imported from their respective files.

class Transaction {
  final String id;
  final double amount;
  final String currency;
  final String reference;
  final String status; // 'Success', 'Pending', 'Failed'
  final DateTime createdAt;

  Transaction({
    required this.id,
    required this.amount,
    required this.currency,
    required this.reference,
    required this.status,
    required this.createdAt,
  });
}

abstract class ApiService {
  Future<List<Transaction>> getTransactions({
    int page = 1,
    String? search,
    String? status,
    DateTimeRange? dateRange,
  });
  Future<void> exportTransactions();
}

// Provider for ApiService (Mock)
final apiServiceProvider = Provider<ApiService>((ref) => throw UnimplementedError());

// State for filtering and pagination
class TransactionsState {
  final List<Transaction> transactions;
  final bool isLoading;
  final bool isLoadMore;
  final String? error;
  final int currentPage;
  final bool hasMore;
  final String searchQuery;
  final String statusFilter;
  final DateTimeRange? dateRange;

  TransactionsState({
    this.transactions = const [],
    this.isLoading = false,
    this.isLoadMore = false,
    this.error,
    this.currentPage = 1,
    this.hasMore = true,
    this.searchQuery = '',
    this.statusFilter = 'All',
    this.dateRange,
  });

  TransactionsState copyWith({
    List<Transaction>? transactions,
    bool? isLoading,
    bool? isLoadMore,
    String? error,
    int? currentPage,
    bool? hasMore,
    String? searchQuery,
    String? statusFilter,
    DateTimeRange? dateRange,
  }) {
    return TransactionsState(
      transactions: transactions ?? this.transactions,
      isLoading: isLoading ?? this.isLoading,
      isLoadMore: isLoadMore ?? this.isLoadMore,
      error: error,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      searchQuery: searchQuery ?? this.searchQuery,
      statusFilter: statusFilter ?? this.statusFilter,
      dateRange: dateRange ?? this.dateRange,
    );
  }
}

class TransactionsNotifier extends StateNotifier<TransactionsState> {
  final ApiService _apiService;

  TransactionsNotifier(this._apiService) : super(TransactionsState()) {
    loadTransactions();
  }

  Future<void> loadTransactions({bool refresh = false}) async {
    if (refresh) {
      state = state.copyWith(isLoading: true, currentPage: 1, hasMore: true, transactions: []);
    } else if (state.isLoading || !state.hasMore) {
      return;
    } else {
      state = state.copyWith(isLoading: state.currentPage == 1, isLoadMore: state.currentPage > 1);
    }

    try {
      final results = await _apiService.getTransactions(
        page: state.currentPage,
        search: state.searchQuery.isEmpty ? null : state.searchQuery,
        status: state.statusFilter == 'All' ? null : state.statusFilter,
        dateRange: state.dateRange,
      );

      state = state.copyWith(
        transactions: refresh ? results : [...state.transactions, ...results],
        isLoading: false,
        isLoadMore: false,
        currentPage: state.currentPage + 1,
        hasMore: results.length >= 20, // Assuming page size is 20
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, isLoadMore: false, error: e.toString());
    }
  }

  void updateSearch(String query) {
    state = state.copyWith(searchQuery: query);
    loadTransactions(refresh: true);
  }

  void updateStatus(String status) {
    state = state.copyWith(statusFilter: status);
    loadTransactions(refresh: true);
  }

  void updateDateRange(DateTimeRange? range) {
    state = state.copyWith(dateRange: range);
    loadTransactions(refresh: true);
  }

  Future<void> export() async {
    await _apiService.exportTransactions();
  }
}

final transactionsProvider = StateNotifierProvider<TransactionsNotifier, TransactionsState>((ref) {
  final apiService = ref.watch(apiServiceProvider);
  return TransactionsNotifier(apiService);
});

/// TransactionsScreen Implementation
class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      ref.read(transactionsProvider.notifier).loadTransactions();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(transactionsProvider);
    final notifier = ref.read(transactionsProvider.notifier);

    // Theme Colors
    const bgColor = Color(0xFF0F172A);
    const surfaceColor = Color(0xFF1E293B);
    const borderColor = Color(0xFF334155);
    const primaryColor = Color(0xFF3B82F6);
    const textColor = Color(0xFFF1F5F9);
    const mutedColor = Color(0xFF94A3B8);

    return Theme(
      data: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: bgColor,
        colorScheme: const ColorScheme.dark(
          primary: primaryColor,
          surface: surfaceColor,
          onSurface: textColor,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: bgColor,
          elevation: 0,
          centerTitle: false,
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Transactions',
            style: TextStyle(fontWeight: FontWeight.bold, color: textColor),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.file_download_outlined, color: primaryColor),
              onPressed: () => notifier.export(),
              tooltip: 'Export Transactions',
            ),
          ],
        ),
        body: Column(
          children: [
            // Search Bar
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: TextField(
                controller: _searchController,
                onChanged: (value) => notifier.updateSearch(value),
                decoration: InputDecoration(
                  hintText: 'Search by reference...',
                  hintStyle: const TextStyle(color: mutedColor),
                  prefixIcon: const Icon(Icons.search, color: mutedColor),
                  filled: true,
                  fillColor: surfaceColor,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: borderColor),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: borderColor),
                  ),
                ),
              ),
            ),

            // Filters
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    isSelected: state.statusFilter == 'All',
                    onSelected: () => notifier.updateStatus('All'),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Success',
                    isSelected: state.statusFilter == 'Success',
                    onSelected: () => notifier.updateStatus('Success'),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Pending',
                    isSelected: state.statusFilter == 'Pending',
                    onSelected: () => notifier.updateStatus('Pending'),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Failed',
                    isSelected: state.statusFilter == 'Failed',
                    onSelected: () => notifier.updateStatus('Failed'),
                  ),
                  const SizedBox(width: 16),
                  VerticalDivider(color: borderColor, width: 1),
                  const SizedBox(width: 16),
                  TextButton.icon(
                    onPressed: () async {
                      final range = await showDateRangePicker(
                        context: context,
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now(),
                        builder: (context, child) {
                          return Theme(
                            data: ThemeData.dark().copyWith(
                              colorScheme: const ColorScheme.dark(
                                primary: primaryColor,
                                onPrimary: Colors.white,
                                surface: surfaceColor,
                                onSurface: textColor,
                              ),
                            ),
                            child: child!,
                          );
                        },
                      );
                      notifier.updateDateRange(range);
                    },
                    icon: const Icon(Icons.calendar_today, size: 16, color: primaryColor),
                    label: Text(
                      state.dateRange == null
                          ? 'Date Range'
                          : '${DateFormat('MMM d').format(state.dateRange!.start)} - ${DateFormat('MMM d').format(state.dateRange!.end)}',
                      style: const TextStyle(color: primaryColor),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Transactions List
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => notifier.loadTransactions(refresh: true),
                color: primaryColor,
                backgroundColor: surfaceColor,
                child: _buildList(state),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildList(TransactionsState state) {
    if (state.isLoading && state.transactions.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF3B82F6)));
    }

    if (state.error != null && state.transactions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
            const SizedBox(height: 16),
            Text(state.error!, style: const TextStyle(color: Color(0xFFF1F5F9))),
            TextButton(
              onPressed: () => ref.read(transactionsProvider.notifier).loadTransactions(refresh: true),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (state.transactions.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long_outlined, size: 64, color: Color(0xFF94A3B8)),
            const SizedBox(height: 16),
            Text(
              'No transactions found',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: state.transactions.length + (state.hasMore ? 1 : 0),
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        if (index == state.transactions.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16.0),
              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF3B82F6)),
            ),
          );
        }

        final tx = state.transactions[index];
        return _TransactionCard(
          transaction: tx,
          onTap: () => context.push('/transactions/${tx.id}'),
        );
      },
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onSelected;

  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(),
      selectedColor: const Color(0xFF3B82F6).withOpacity(0.2),
      labelStyle: TextStyle(
        color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF94A3B8),
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
      backgroundColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: isSelected ? const Color(0xFF3B82F6) : const Color(0xFF334155),
        ),
      ),
      showCheckmark: false,
    );
  }
}

class _TransactionCard extends StatelessWidget {
  final Transaction transaction;
  final VoidCallback onTap;

  const _TransactionCard({
    required this.transaction,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(symbol: transaction.currency == 'USD' ? '$' : transaction.currency);
    
    Color statusColor;
    IconData statusIcon;
    switch (transaction.status.toLowerCase()) {
      case 'success':
        statusColor = Colors.greenAccent;
        statusIcon = Icons.check_circle_outline;
        break;
      case 'pending':
        statusColor = Colors.orangeAccent;
        statusIcon = Icons.access_time;
        break;
      case 'failed':
        statusColor = Colors.redAccent;
        statusIcon = Icons.error_outline;
        break;
      default:
        statusColor = const Color(0xFF94A3B8);
        statusIcon = Icons.help_outline;
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(statusIcon, color: statusColor, size: 20),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    transaction.reference,
                    style: const TextStyle(
                      color: Color(0xFFF1F5F9),
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('MMM d, yyyy • HH:mm').format(transaction.createdAt),
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  currencyFormat.format(transaction.amount),
                  style: const TextStyle(
                    color: Color(0xFFF1F5F9),
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  transaction.status,
                  style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
