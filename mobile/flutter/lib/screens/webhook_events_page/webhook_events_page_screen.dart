import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';
import 'dart:convert';

// Define the data model for a Webhook Event
class WebhookEvent {
  final String id;
  String eventType;
  String status;
  final DateTime timestamp;
  Map<String, dynamic> payload;

  WebhookEvent({
    required this.id,
    required this.eventType,
    required this.status,
    required this.timestamp,
    required this.payload,
  });

  factory WebhookEvent.fromJson(Map<String, dynamic> json) {
    return WebhookEvent(
      id: json['id'] as String,
      eventType: json['eventType'] as String,
      status: json['status'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      payload: json['payload'] as Map<String, dynamic>,
    );
  }

  // Helper for search functionality
  bool containsQuery(String query) {
    final lowerCaseQuery = query.toLowerCase();
    return id.toLowerCase().contains(lowerCaseQuery) ||
        eventType.toLowerCase().contains(lowerCaseQuery) ||
        status.toLowerCase().contains(lowerCaseQuery) ||
        timestamp.toIso8601String().toLowerCase().contains(lowerCaseQuery) ||
        payload.toString().toLowerCase().contains(lowerCaseQuery);
  }

  // Helper for converting to JSON for API calls
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'eventType': eventType,
      'status': status,
      'timestamp': timestamp.toIso8601String(),
      'payload': payload,
    };
  }
}

// Riverpod provider for Webhook Events
final webhookEventsProvider = FutureProvider.autoDispose<List<WebhookEvent>>((ref) async {
  try {
    final response = await ref.read(apiServiceProvider).get('/trpc/webhookEvents.list');
    return (response.data as List).map((e) => WebhookEvent.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e) {
    print('Error fetching webhook events: $e');
    rethrow;
  }
});

// Provider for search query
final searchQueryProvider = StateProvider<String>((ref) => '');

class WebhookEventsPageScreen extends ConsumerStatefulWidget {
  const WebhookEventsPageScreen({super.key});

  @override
  ConsumerState<WebhookEventsPageScreen> createState() => _WebhookEventsPageScreenState();
}

class _WebhookEventsPageScreenState extends ConsumerState<WebhookEventsPageScreen> {
  bool _isSearching = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      ref.read(searchQueryProvider.notifier).state = _searchController.text;
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final webhookEventsAsyncValue = ref.watch(webhookEventsProvider);
    final searchQuery = ref.watch(searchQueryProvider);

    // Dark theme colors
    const Color backgroundColor = Color(0xFF0f172a);
    const Color cardColor = Color(0xFF1e293b);
    const Color textColor = Color(0xFFf1f5f9);
    const Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search events...',
                  hintStyle: TextStyle(color: textColor.withOpacity(0.7)),
                  border: InputBorder.none,
                ),
                style: const TextStyle(color: textColor),
              )
            : const Text('Webhook Events', style: TextStyle(color: textColor)),
        backgroundColor: cardColor,
        iconTheme: const IconThemeData(color: textColor),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search, color: textColor),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchController.clear();
                  ref.read(searchQueryProvider.notifier).state = '';
                }
              });
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(webhookEventsProvider.future),
        child: webhookEventsAsyncValue.when(
          data: (events) {
            final filteredEvents = events.where((event) => event.containsQuery(searchQuery)).toList();

            if (filteredEvents.isEmpty) {
              return Center(
                child: Text(
                  searchQuery.isEmpty ? 'No webhook events found.' : 'No matching webhook events found.',
                  style: const TextStyle(color: textColor, fontSize: 18),
                ),
              );
            }
            return ListView.builder(
              itemCount: filteredEvents.length,
              itemBuilder: (context, index) {
                final event = filteredEvents[index];
                return Card(
                  color: cardColor,
                  margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ID: ${event.id}', style: const TextStyle(color: textColor)),
                        Text('Event Type: ${event.eventType}', style: const TextStyle(color: textColor)),
                        _buildStatusBadge(event.status),
                        Text('Timestamp: ${DateFormat('yyyy-MM-dd HH:mm').format(event.timestamp)}', style: const TextStyle(color: textColor)),
                        _buildPayloadDisplay(event.payload, textColor),
                        Align(
                          alignment: Alignment.bottomRight,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.edit, color: accentColor),
                                onPressed: () => _showEditDialog(context, event),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(context, event.id),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: $error',
              style: const TextStyle(color: Colors.red, fontSize: 18),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context),
        backgroundColor: accentColor,
        child: const Icon(Icons.add, color: textColor),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: badgeColor,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(color: textColor, fontWeight: FontWeight.bold, fontSize: 12),
      ),
    );
  }

  Widget _buildPayloadDisplay(Map<String, dynamic> payload, Color textColor) {
    List<Widget> payloadWidgets = [];
    payload.forEach((key, value) {
      String displayValue = value.toString();
      if (key == 'amount' && payload.containsKey('currency')) {
        String currency = payload['currency'] as String;
        if (currency == 'NGN') {
          displayValue = '₦' + NumberFormat('#,##0').format(value);
        } else if (currency == 'USD') {
          displayValue = '\$' + NumberFormat('#,##0.00').format(value);
        }
      }
      payloadWidgets.add(Text('$key: $displayValue', style: TextStyle(color: textColor)));
    });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4.0),
          child: Text('Payload:', style: TextStyle(color: textColor, fontWeight: FontWeight.bold)),
        ),
        ...payloadWidgets,
      ],
    );
  }

  Future<void> _showCreateDialog(BuildContext context) async {
    final TextEditingController eventTypeController = TextEditingController();
    final TextEditingController statusController = TextEditingController();
    final TextEditingController payloadController = TextEditingController();

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Create Webhook Event', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: eventTypeController,
                  decoration: const InputDecoration(
                    labelText: 'Event Type',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: payloadController,
                  decoration: const InputDecoration(
                    labelText: 'Payload (JSON string)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.multiline,
                  maxLines: null,
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                try {
                  final newEventData = {
                    'eventType': eventTypeController.text,
                    'status': statusController.text,
                    'payload': payloadController.text.isNotEmpty ? Map<String, dynamic>.from(json.decode(payloadController.text)) : {},
                  };
                  await ref.read(apiServiceProvider).post('/trpc/webhookEvents.create', body: newEventData);
                  Navigator.of(context).pop();
                  ref.refresh(webhookEventsProvider.future);
                } catch (e) {
                  print('Error creating event: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create event: $e', style: const TextStyle(color: Colors.white)), backgroundColor: Colors.red),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEditDialog(BuildContext context, WebhookEvent event) async {
    final TextEditingController eventTypeController = TextEditingController(text: event.eventType);
    final TextEditingController statusController = TextEditingController(text: event.status);
    final TextEditingController payloadController = TextEditingController(text: json.encode(event.payload));

    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: Text('Edit Webhook Event ${event.id}', style: const TextStyle(color: Color(0xFFf1f5f9))),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: eventTypeController,
                  decoration: const InputDecoration(
                    labelText: 'Event Type',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                ),
                TextField(
                  controller: payloadController,
                  decoration: const InputDecoration(
                    labelText: 'Payload (JSON string)',
                    labelStyle: TextStyle(color: Color(0xFFf1f5f9)),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFf1f5f9))),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF6366f1))),
                  ),
                  style: const TextStyle(color: Color(0xFFf1f5f9)),
                  keyboardType: TextInputType.multiline,
                  maxLines: null,
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: Color(0xFF6366f1))),
              onPressed: () async {
                try {
                  final updatedEventData = {
                    'id': event.id,
                    'eventType': eventTypeController.text,
                    'status': statusController.text,
                    'payload': payloadController.text.isNotEmpty ? Map<String, dynamic>.from(json.decode(payloadController.text)) : {},
                  };
                  await ref.read(apiServiceProvider).post('/trpc/webhookEvents.update', body: updatedEventData);
                  Navigator.of(context).pop();
                  ref.refresh(webhookEventsProvider.future);
                } catch (e) {
                  print('Error updating event: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update event: $e', style: const TextStyle(color: Colors.white)), backgroundColor: Colors.red),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDeleteConfirmationDialog(BuildContext context, String eventId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1e293b),
          title: const Text('Confirm Delete', style: TextStyle(color: Color(0xFFf1f5f9))),
          content: Text('Are you sure you want to delete event $eventId?', style: const TextStyle(color: Color(0xFFf1f5f9))),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: Color(0xFFf1f5f9))),
              onPressed: () {
                Navigator.of(context).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                try {
                  await ref.read(apiServiceProvider).post('/trpc/webhookEvents.delete', body: {'id': eventId});
                  Navigator.of(context).pop();
                  ref.refresh(webhookEventsProvider.future);
                } catch (e) {
                  print('Error deleting event: $e');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete event: $e', style: const TextStyle(color: Colors.white)), backgroundColor: Colors.red),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }
}
