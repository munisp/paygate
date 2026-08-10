import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:convert';
import '../../services/api_service.dart';

// Define hypothetical data models
class WebhookEvent {
  final String id;
  final String type;
  final Map<String, dynamic> payload;
  final String status;
  final DateTime timestamp;

  WebhookEvent({
    required this.id,
    required this.type,
    required this.payload,
    required this.status,
    required this.timestamp,
  });

  factory WebhookEvent.fromJson(Map<String, dynamic> json) {
    return WebhookEvent(
      id: json['id'],
      type: json['type'],
      payload: json['payload'],
      status: json['status'],
      timestamp: DateTime.parse(json['timestamp']),
    );
  }
}

// Riverpod provider for webhook events
final webhookEventsProvider = FutureProvider.family<List<WebhookEvent>, Map<String, dynamic>>((ref, filters) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trpc/webhookSimulatorV2.list', params: filters);
  return (response['webhookEvents'] as List)
      .map((e) => WebhookEvent.fromJson(e))
      .toList();
});

class WebhookSimulatorV2Screen extends ConsumerStatefulWidget {
  const WebhookSimulatorV2Screen({super.key});

  @override
  ConsumerState<WebhookSimulatorV2Screen> createState() => _WebhookSimulatorV2ScreenState();
}

class _WebhookSimulatorV2ScreenState extends ConsumerState<WebhookSimulatorV2Screen> {
  // Dark theme colors
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final webhookEventsAsyncValue = ref.watch(webhookEventsProvider({'search': _searchQuery}));

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: const Text('Webhook Simulator V2', style: TextStyle(color: _textColor)),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _textColor),
            onPressed: () => _showCreateWebhookDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(webhookEventsProvider({'search': _searchQuery}).future),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: TextField(
                onChanged: (value) {
                  setState(() {
                    _searchQuery = value;
                  });
                },
                style: const TextStyle(color: _textColor),
                decoration: InputDecoration(
                  hintText: 'Search webhooks...', 
                  hintStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                  prefixIcon: const Icon(Icons.search, color: _textColor),
                  filled: true,
                  fillColor: _cardColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: webhookEventsAsyncValue.when(
                loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
                error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.redAccent))),
                data: (webhookEvents) {
                  if (webhookEvents.isEmpty) {
                    return const Center(child: Text('No webhook events found.', style: TextStyle(color: _textColor)));
                  }
                  return ListView.builder(
                    itemCount: webhookEvents.length,
                    itemBuilder: (context, index) {
                      final event = webhookEvents[index];
                      return Card(
                        color: _cardColor,
                        margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        child: ListTile(
                          title: Text(event.type, style: const TextStyle(color: _textColor, fontWeight: FontWeight.bold)),
                          subtitle: Text(
                            'Status: ${event.status} - ${event.timestamp.toLocal().toIso8601String().split('T')[0]}',
                            style: TextStyle(color: _textColor.withOpacity(0.8)),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _buildStatusBadge(event.status),
                              IconButton(
                                icon: const Icon(Icons.edit, color: _accentColor),
                                onPressed: () => _showEditWebhookDialog(context, event),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _showDeleteConfirmationDialog(context, event.id),
                              ),
                            ],
                          ),
                          onTap: () => _showWebhookDetailsDialog(context, event),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status.toLowerCase()) {
      case 'success':
        color = Colors.green;
        break;
      case 'failed':
        color = Colors.red;
        break;
      case 'pending':
        color = Colors.orange;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(status, style: const TextStyle(color: Colors.white, fontSize: 12)),
    );
  }

  void _showCreateWebhookDialog(BuildContext context) {
    final TextEditingController _typeController = TextEditingController();
    final TextEditingController _payloadController = TextEditingController();
    final TextEditingController _statusController = TextEditingController();
    // Implementation for creating a new webhook
    // This would typically involve a form and a call to api.post('/trpc/webhookSimulatorV2.create', body: {...})
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create Webhook Event', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _typeController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Type',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _payloadController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Payload (JSON)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _statusController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                // Example: TextField for type, payload, etc.
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                await api.post("/trpc/webhookSimulatorV2.create", body: {
                  // Placeholder for actual data from form
                  "type": _typeController.text,
                  "payload": json.decode(_payloadController.text),
                  "status": _statusController.text,
                });
                Navigator.of(dialogContext).pop();
                ref.invalidate(webhookEventsProvider);
              },
            ),
          ],
        );
      },
    ).then((_) {
      _typeController.dispose();
      _payloadController.dispose();
      _statusController.dispose();
    });
  }

  void _showEditWebhookDialog(BuildContext context, WebhookEvent event) {
    final TextEditingController _typeController = TextEditingController(text: event.type);
    final TextEditingController _payloadController = TextEditingController(text: json.encode(event.payload));
    final TextEditingController _statusController = TextEditingController(text: event.status);
    // Implementation for editing an existing webhook
    // This would typically involve a form pre-filled with event data and a call to api.post('/trpc/webhookSimulatorV2.update', body: {...})
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Edit Webhook Event ${event.id}', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: _typeController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Type',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _payloadController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Payload (JSON)',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _statusController,
                  style: const TextStyle(color: _textColor),
                  decoration: InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor.withOpacity(0.7)),
                    enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: _textColor.withOpacity(0.5))),
                    focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                ),
                // Example: TextField for type, payload, etc.
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                await api.post("/trpc/webhookSimulatorV2.update", body: {
                  "id": event.id,
                  // Placeholder for actual data from form
                  "type": _typeController.text,
                  "payload": json.decode(_payloadController.text),
                  "status": _statusController.text,
                });
                Navigator.of(dialogContext).pop();
                ref.invalidate(webhookEventsProvider);
              },
            ),
          ],
        );
      },
    ).then((_) {
      _typeController.dispose();
      _payloadController.dispose();
      _statusController.dispose();
    });
  }

  void _showDeleteConfirmationDialog(BuildContext context, String eventId) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to delete this webhook event?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                final api = ref.read(apiServiceProvider);
                await api.post('/trpc/webhookSimulatorV2.delete', body: {'id': eventId});
                Navigator.of(dialogContext).pop();
                ref.invalidate(webhookEventsProvider);
              },
            ),
          ],
        );
      },
    );
  }

  void _showWebhookDetailsDialog(BuildContext context, WebhookEvent event) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: Text('Webhook Event Details', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                Text('ID: ${event.id}', style: TextStyle(color: _textColor)),
                Text('Type: ${event.type}', style: TextStyle(color: _textColor)),
                Text('Status: ${event.status}', style: TextStyle(color: _textColor)),
                Text('Timestamp: ${event.timestamp.toLocal()}', style: TextStyle(color: _textColor)),
                Text('Payload: ${event.payload}', style: TextStyle(color: _textColor)),
                // Add more details as needed
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Close', style: TextStyle(color: _accentColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
          ],
        );
      },
    );
  }
}
