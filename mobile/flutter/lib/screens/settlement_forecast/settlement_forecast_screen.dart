import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Dark theme colors
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

// Data Model for Settlement Forecast
class SettlementForecast {
  final String id;
  final String merchantName;
  final double amount;
  final String currency;
  final DateTime settlementDate;
  final String status;

  SettlementForecast({
    required this.id,
    required this.merchantName,
    required this.amount,
    required this.currency,
    required this.settlementDate,
    required this.status,
  });

  factory SettlementForecast.fromJson(Map<String, dynamic> json) {
    return SettlementForecast(
      id: json['id'],
      merchantName: json['merchantName'],
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'],
      settlementDate: DateTime.parse(json['settlementDate']),
      status: json['status'],
    );
  }
}

// State for Settlement Forecast
class SettlementForecastState {
  final bool isLoading;
  final String? error;
  final List<SettlementForecast> forecasts;
  final String searchQuery;

  SettlementForecastState({
    this.isLoading = false,
    this.error,
    this.forecasts = const [],
    this.searchQuery = '',
  });

  SettlementForecastState copyWith({
    bool? isLoading,
    String? error,
    List<SettlementForecast>? forecasts,
    String? searchQuery,
  }) {
    return SettlementForecastState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      forecasts: forecasts ?? this.forecasts,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

// StateNotifier for Settlement Forecast
class SettlementForecastNotifier extends StateNotifier<SettlementForecastState> {
  final ApiService _apiService;

  SettlementForecastNotifier(this._apiService) : super(SettlementForecastState()) {
    fetchSettlementForecasts();
  }

  Future<void> fetchSettlementForecasts() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // Simulate API call with dummy data
      // In a real scenario, this would call the tRPC API
      final response = await _apiService.get(
        '/trpc/settlementForecast.list',
        params: {},
      );
      final List<SettlementForecast> forecasts = (
          response as List)
          .map((e) => SettlementForecast.fromJson(e))
          .toList();
      state = state.copyWith(isLoading: false, forecasts: forecasts);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void updateSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }
}

// Provider for Settlement Forecast Notifier
final settlementForecastProvider = StateNotifierProvider<
    SettlementForecastNotifier, SettlementForecastState>(
      (ref) => SettlementForecastNotifier(ref.read(apiServiceProvider)),
);

class SettlementForecastScreen extends ConsumerStatefulWidget {
  const SettlementForecastScreen({super.key});

  @override
  ConsumerState<SettlementForecastScreen> createState() => _SettlementForecastScreenState();
}

class _SettlementForecastScreenState extends ConsumerState<SettlementForecastScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(settlementForecastProvider.notifier).updateSearchQuery(_searchController.text);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settlementForecastState = ref.watch(settlementForecastProvider);

    final filteredForecasts = settlementForecastState.forecasts.where((forecast) {
      final query = settlementForecastState.searchQuery.toLowerCase();
      return forecast.merchantName.toLowerCase().contains(query) ||
          forecast.status.toLowerCase().contains(query) ||
          forecast.amount.toString().contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text(
          'Settlement Forecast',
          style: TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by merchant, status, or amount',
                hintStyle: const TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor),
                filled: true,
                fillColor: _cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(settlementForecastProvider.notifier).fetchSettlementForecasts(),
        child: settlementForecastState.isLoading
            ? const Center(child: CircularProgressIndicator(color: _accentColor))
            : settlementForecastState.error != null
            ? Center(
          child: Text(
            'Error: ${settlementForecastState.error}',
            style: const TextStyle(color: Colors.red),
          ),
        )
            : filteredForecasts.isEmpty
            ? Center(
          child: Text(
            'No settlement forecasts available.',
            style: TextStyle(color: _textColor),
          ),
        )
            : ListView.builder(
          itemCount: filteredForecasts.length,
          itemBuilder: (context, index) {
            final forecast = filteredForecasts[index];
            return Card(
              color: _cardColor,
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Merchant: ${forecast.merchantName}',
                      style: const TextStyle(
                        color: _textColor,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Amount: ${forecast.currency == 'NGN' ? '₦' : '$'}${forecast.amount.toStringAsFixed(2)}',
                      style: const TextStyle(color: _textColor),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Date: ${forecast.settlementDate.toLocal().toString().split(' ')[0]}',
                      style: const TextStyle(color: _textColor),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text(
                          'Status: ',
                          style: TextStyle(color: _textColor),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: forecast.status == 'Settled'
                                ? Colors.green.shade700
                                : forecast.status == 'Pending'
                                ? Colors.orange.shade700
                                : Colors.red.shade700,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            forecast.status,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
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
}
