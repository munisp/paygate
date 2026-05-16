import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

// Define a data class for BNPL calculation parameters
class BNPLCalculationParams {
  final double amount;
  final int tenor;

  BNPLCalculationParams({required this.amount, required this.tenor});

  Map<String, dynamic> toJson() => {
        'amount': amount,
        'tenor': tenor,
      };
}

// Define a data class for BNPL calculation result
class BNPLCalculationResult {
  final double monthlyPayment;
  final double totalRepayment;
  final double interestRate;

  BNPLCalculationResult({
    required this.monthlyPayment,
    required this.totalRepayment,
    required this.interestRate,
  });

  factory BNPLCalculationResult.fromJson(Map<String, dynamic> json) {
    return BNPLCalculationResult(
      monthlyPayment: (json['monthlyPayment'] as num).toDouble(),
      totalRepayment: (json['totalRepayment'] as num).toDouble(),
      interestRate: (json['interestRate'] as num).toDouble(),
    );
  }
}

// Provider for the BNPL calculation parameters
final bnplCalculationParamsProvider = StateProvider<BNPLCalculationParams?>((ref) => null);

// FutureProvider for the BNPL calculation result
final bnplCalculationResultProvider = FutureProvider.autoDispose<BNPLCalculationResult?>((ref) async {
  final params = ref.watch(bnplCalculationParamsProvider);
  if (params == null) {
    return null;
  }

  try {
    final apiService = ref.read(apiServiceProvider);
    final response = await apiService.post(
      '/trpc/bnpl.calculate',
      body: params.toJson(),
    );
    return BNPLCalculationResult.fromJson(response as Map<String, dynamic>);
  } catch (e) {
    print('Error calculating BNPL: $e');
    rethrow;
  }
});

class BNPLCalculatorScreen extends ConsumerStatefulWidget {
  const BNPLCalculatorScreen({super.key});

  @override
  ConsumerState<BNPLCalculatorScreen> createState() => _BNPLCalculatorScreenState();
}

class _BNPLCalculatorScreenState extends ConsumerState<BNPLCalculatorScreen> {
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _tenorController = TextEditingController();
  String? _amountErrorText;
  String? _tenorErrorText;

  @override
  void dispose() {
    _amountController.dispose();
    _tenorController.dispose();
    super.dispose();
  }

  void _calculateBNPL() {
    setState(() {
      _amountErrorText = null;
      _tenorErrorText = null;
    });

    final amount = double.tryParse(_amountController.text);
    final tenor = int.tryParse(_tenorController.text);

    bool isValid = true;
    if (amount == null || amount <= 0) {
      setState(() {
        _amountErrorText = 'Please enter a valid amount.';
      });
      isValid = false;
    }
    if (tenor == null || tenor <= 0) {
      setState(() {
        _tenorErrorText = 'Please enter a valid tenor.';
      });
      isValid = false;
    }

    if (isValid) {
      ref.read(bnplCalculationParamsProvider.notifier).state = BNPLCalculationParams(
        amount: amount!,
        tenor: tenor!,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bnplResultAsync = ref.watch(bnplCalculationResultProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Dark background
      appBar: AppBar(
        title: const Text(
          'BNPL Calculator',
          style: TextStyle(color: Color(0xFFf1f5f9)), // Light text
        ),
        backgroundColor: const Color(0xFF1e293b), // Card background for app bar
        iconTheme: const IconThemeData(color: Color(0xFFf1f5f9)), // Light icons
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(bnplCalculationResultProvider);
          // Optionally re-trigger calculation if params are already set
          final currentParams = ref.read(bnplCalculationParamsProvider);
          if (currentParams != null) {
            ref.read(bnplCalculationParamsProvider.notifier).state = BNPLCalculationParams(
              amount: currentParams.amount,
              tenor: currentParams.tenor,
            );
          }
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(), // Allows pull-to-refresh even if content is small
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    errorText: _amountErrorText,
                    enabledBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    errorBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.redAccent),
                    ),
                    focusedErrorBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.redAccent),
                    ),
                  ),
                ),
                const SizedBox(height: 16.0),
                TextField(
                  controller: _tenorController,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  decoration: InputDecoration(
                    labelText: 'Tenor (months)',
                    labelStyle: const TextStyle(color: Color(0xFFf1f5f9)),
                    errorText: _tenorErrorText,
                    enabledBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF6366f1)),
                    ),
                    errorBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.redAccent),
                    ),
                    focusedErrorBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.redAccent),
                    ),
                  ),
                ),
                const SizedBox(height: 16.0),
                ElevatedButton(
                  onPressed: _calculateBNPL,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6366f1), // Accent color
                    foregroundColor: const Color(0xFFf1f5f9), // Light text
                    padding: const EdgeInsets.symmetric(vertical: 12.0),
                  ),
                  child: const Text(
                    'Calculate',
                    style: TextStyle(fontSize: 16.0),
                  ),
                ),
                const SizedBox(height: 24.0),
                bnplResultAsync.when(
                  data: (result) {
                    if (result == null) {
                      return const Center(
                        child: Text(
                          'Enter amount and tenor to see BNPL calculation results.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
                        ),
                      );
                    }
                    return Card(
                      color: const Color(0xFF1e293b), // Card background
                      elevation: 4.0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildResultRow('Monthly Payment', '₦${result.monthlyPayment.toStringAsFixed(2)}'),
                            _buildResultRow('Total Repayment', '₦${result.totalRepayment.toStringAsFixed(2)}'),
                            _buildResultRow('Interest Rate', '${result.interestRate.toStringAsFixed(2)}%'),
                          ],
                        ),
                      ),
                    );
                  },
                  loading: () => const Center(
                    child: CircularProgressIndicator(color: Color(0xFF6366f1)),
                  ),
                  error: (err, stack) => Center(
                    child: Text(
                      'Error: Failed to calculate BNPL. Please try again.\n$err',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 16),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildResultRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16, fontWeight: FontWeight.w500),
          ),
          Text(
            value,
            style: const TextStyle(color: Color(0xFFf1f5f9), fontSize: 16),
          ),
        ],
      ),
    );
  }
}
