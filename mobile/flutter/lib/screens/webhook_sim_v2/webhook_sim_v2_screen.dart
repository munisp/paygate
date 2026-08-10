import '../../services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

// Dummy dioProvider for demonstration. In a real app, this would be properly configured.
final dioProvider = Provider<Dio>((ref) => Dio());

class WebhookSimV2Screen extends ConsumerStatefulWidget {
  const WebhookSimV2Screen({super.key});

  @override
  ConsumerState<WebhookSimV2Screen> createState() => _WebhookSimV2ScreenState();
}

class _WebhookSimV2ScreenState extends ConsumerState<WebhookSimV2Screen> {
  bool _isLoading = false;
  String? _error;
  List<dynamic> _webhookEvents = [];

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
      final response = await dio.get('/api/trpc/webhooks.listDeliveries');
      setState(() {
        _webhookEvents = response.data['result']['data']; // Adjust based on actual API response structure
      });
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to load webhook events: ${e.message}';
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

  Future<void> _simulateWebhook() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      // Assuming a simple POST request without specific data for simulation
      await dio.post('/api/trpc/webhooks.simulate', data: {'event': 'test.event', 'payload': {'key': 'value'}});
      // After simulating, refresh the list of deliveries
      await _loadData();
    } on DioException catch (e) {
      setState(() {
        _error = 'Failed to simulate webhook: ${e.message}';
      });
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred: $e';
      });
    }
    finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Webhook Simulator v2'),
      ),
      body: Center(
        child: Column(
          children: [
            const Text('Webhook Events'),
            if (_isLoading)
              const CircularProgressIndicator()
            else if (_error != null)
              Text(
                'Error: $_error',
                style: const TextStyle(color: Colors.red),
              )
            else if (_webhookEvents.isEmpty)
              const Text('No webhook events to display.')
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _webhookEvents.length,
                  itemBuilder: (context, index) {
                    final event = _webhookEvents[index];
                    return ListTile(
                      title: Text(event['id']?.toString() ?? 'N/A'),
                      subtitle: Text(event['status']?.toString() ?? 'N/A'),
                      // You might want to display more details here
                    );
                  },
                ),
              ),
            ElevatedButton(
              onPressed: _isLoading ? null : _simulateWebhook,
              child: const Text('Simulate Webhook'),
            ),
          ],
        ),
      ),
    );
  }
}
