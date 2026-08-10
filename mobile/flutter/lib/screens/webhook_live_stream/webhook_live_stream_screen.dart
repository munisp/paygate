import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart'; // For date formatting

// Define theme colors
const Color _backgroundColor = Color(0xFF0f172a);
const Color _cardColor = Color(0xFF1e293b);
const Color _textColor = Color(0xFFf1f5f9);
const Color _accentColor = Color(0xFF6366f1);

/// Data model for a single webhook event
class WebhookEvent {
  final String id;
  final String eventType;
  final String payload;
  final DateTime timestamp;
  final String status;
  final int attempts;

  WebhookEvent({
    required this.id,
    required this.eventType,
    required this.payload,
    required this.timestamp,
    required this.status,
    required this.attempts,
  });

  factory WebhookEvent.fromJson(Map<String, dynamic> json) {
    return WebhookEvent(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      payload: json['payload'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      status: json['status'] as String,
      attempts: json['attempts'] as int,
    );
  }
}

// Notifier for managing webhook events state with search query
class WebhookEventsNotifier extends Notifier<AsyncValue<List<WebhookEvent>>> {
  @override
  AsyncValue<List<WebhookEvent>> build() {
    final searchQuery = ref.watch(_searchQueryProvider);
    fetchWebhookEvents(searchQuery: searchQuery);
    return const AsyncValue.loading();
  }

  Future<void> fetchWebhookEvents({String searchQuery = ''}) async {
    state = const AsyncValue.loading();
    try {
      final api = ref.read(apiServiceProvider);
      final response = await api.get('/trpc/webhooks.liveStream', params: {'searchQuery': searchQuery});
      final List<WebhookEvent> events = (response['events'] as List)
          .map((e) => WebhookEvent.fromJson(e as Map<String, dynamic>))
          .toList();
      state = AsyncValue.data(events);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> resendWebhookEvent(String eventId) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/webhooks.resend', body: {'id': eventId});
      // Optionally, refresh the list or update the specific event status
      fetchWebhookEvents(searchQuery: ref.read(_searchQueryProvider));
    } catch (e) {
      // Handle error
      debugPrint('Error resending event: $e');
    }
  }

  Future<void> clearAllWebhookEvents() async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/webhooks.clearAll', body: {});
      // Clear the local state
      state = const AsyncValue.data([]);
    } catch (e) {
      // Handle error
      debugPrint('Error clearing all events: $e');
    }
  }
}

final webhookEventsProvider = NotifierProvider<WebhookEventsNotifier, AsyncValue<List<WebhookEvent>>>(WebhookEventsNotifier.new);

final _searchQueryProvider = StateProvider<String>((ref) => '');

class WebhookLiveStreamScreen extends ConsumerStatefulWidget {
  const WebhookLiveStreamScreen({super.key});

  @override
  ConsumerState<WebhookLiveStreamScreen> createState() => _WebhookLiveStreamScreenState();
}

class _WebhookLiveStreamScreenState extends ConsumerState<WebhookLiveStreamScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(_searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showResendConfirmationDialog(BuildContext context, WebhookEvent event) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Resend', style: TextStyle(color: _textColor)),
          content: Text('Are you sure you want to resend webhook event ${event.id}?', style: const TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Resend', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                ref.read(webhookEventsProvider.notifier).resendWebhookEvent(event.id);
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Resending event ${event.id}...')),
                );
              },
            ),
          ],
        );
      },
    );
  }

  void _showClearAllConfirmationDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Clear All', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to clear all webhook events?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Clear All', style: TextStyle(color: Colors.redAccent)),
              onPressed: () {
                ref.read(webhookEventsProvider.notifier).clearAllWebhookEvents();
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Clearing all events...')),
                );
              },
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final webhookEventsAsyncValue = ref.watch(webhookEventsProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Webhook Live Stream', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.clear_all, color: _textColor),
            onPressed: () => _showClearAllConfirmationDialog(context),
            tooltip: 'Clear All Events',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kToolbarHeight),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search events...', 
                hintStyle: const TextStyle(color: _textColor.withOpacity(0.7)),
                prefixIcon: const Icon(Icons.search, color: _textColor.withOpacity(0.7)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8.0),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: _cardColor,
              ),
              style: const TextStyle(color: _textColor),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(webhookEventsProvider.notifier).fetchWebhookEvents(searchQuery: _searchController.text),
        child: webhookEventsAsyncValue.when(
          data: (events) {
            if (events.isEmpty) {
              return LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: const Center(
                      child: Text(
                        'No webhook events found.',
                        style: TextStyle(color: _textColor),
                      ),
                    ),
                  ),
                ),
              );
            }
            return ListView.builder(
              itemCount: events.length,
              itemBuilder: (context, index) {
                final event = events[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Event ID: ${event.id}',
                              style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold),
                            ),
                            _buildStatusBadge(event.status),
                          ],
                        ),
                        const SizedBox(height: 8.0),
                        Text(
                          'Type: ${event.eventType}',
                          style: const TextStyle(color: _textColor),
                        ),
                        const SizedBox(height: 4.0),
                        Text(
                          'Timestamp: ${DateFormat('yyyy-MM-dd HH:mm:ss').format(event.timestamp.toLocal())}',
                          style: const TextStyle(color: _textColor),
                        ),
                        const SizedBox(height: 4.0),
                        Text(
                          'Attempts: ${event.attempts}',
                          style: const TextStyle(color: _textColor),
                        ),
                        const SizedBox(height: 8.0),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: ElevatedButton(
                            onPressed: () => _showResendConfirmationDialog(context, event),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _accentColor,
                              foregroundColor: _textColor,
                            ),
                            child: const Text('Resend Event'),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Center(
                  child: Text(
                    'Error: ${error.toString()}',
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
    Color textColor = Colors.white;
    switch (status.toLowerCase()) {
      case 'success':
        badgeColor = Colors.green;
        break;
      case 'failed':
        badgeColor = Colors.red;
        break;
      case 'pending':
        badgeColor = Colors.orange;
        break;
      default:
        badgeColor = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4.0),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: textColor, fontSize: 12.0, fontWeight: FontWeight.bold),
      ),
    );
  }
}
