import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Assuming dioProvider is defined elsewhere, e.g., in a providers.dart file
final dioProvider = Provider<Dio>((ref) => Dio());

class FraudRuleEngineScreen extends ConsumerStatefulWidget {
  const FraudRuleEngineScreen({super.key});

  @override
  ConsumerState<FraudRuleEngineScreen> createState() => _FraudRuleEngineScreenState();
}

class _FraudRuleEngineScreenState extends ConsumerState<FraudRuleEngineScreen> {
  List<Map<String, dynamic>> _rules = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get('/api/trpc/fraudRuleEngine.list');
      setState(() {
        _rules = List<Map<String, dynamic>>.from(response.data['data']); // Assuming 'data' key holds the list
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to load rules: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleRuleStatus(String ruleId, bool newValue) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '/api/trpc/fraudRuleEngine.toggleStatus',
        data: {'id': ruleId, 'enabled': newValue},
      );
      // Update the local state after successful API call
      setState(() {
        final ruleIndex = _rules.indexWhere((rule) => rule['id'] == ruleId);
        if (ruleIndex != -1) {
          _rules[ruleIndex]['enabled'] = newValue;
        }
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to toggle rule status: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fraud Rule Engine'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Error: $_error'))
              : _rules.isEmpty
                  ? const Center(child: Text('No fraud rules found.'))
                  : ListView.builder(
                      itemCount: _rules.length,
                      itemBuilder: (context, index) {
                        final rule = _rules[index];
                        return Card(
                          margin: const EdgeInsets.all(8.0),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  rule['name']!,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(rule['description']!),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text('Enabled:'),
                                    Switch(
                                      value: rule['enabled']!,
                                      onChanged: (bool value) {
                                        _toggleRuleStatus(rule['id']!, value);
                                      },
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
