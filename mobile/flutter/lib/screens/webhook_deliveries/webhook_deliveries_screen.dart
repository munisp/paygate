import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

// Data model for a Webhook Delivery
class WebhookDelivery {
  final String id;
  final String webhookId;
  final String status;
  final String payload;
  final DateTime createdAt;
  final DateTime? deliveredAt;
  final int attempts;

  WebhookDelivery({
    required this.id,
    required this.webhookId,
    required this.status,
    required this.payload,
    required this.createdAt,
    this.deliveredAt,
    required this.attempts,
  });

  factory WebhookDelivery.fromJson(Map<String, dynamic> json) {
    return WebhookDelivery(
      id: json['id'],
      webhookId: json['webhookId'],
      status: json['status'],
      payload: json['payload'],
      createdAt: DateTime.parse(json['createdAt']),
      deliveredAt: json['deliveredAt'] != null ? DateTime.parse(json['deliveredAt']) : null,
      attempts: json['attempts'],
    );
  }
}

// State providers for search and filter
final searchQueryProvider = StateProvider<String>((ref) => '');
final filterStatusProvider = StateProvider<String?>((ref) => null);

// Riverpod provider for fetching webhook deliveries with search and filter
final webhookDeliveriesProvider = FutureProvider.autoDispose<List<WebhookDelivery>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final searchQuery = ref.watch(searchQueryProvider);
  final filterStatus = ref.watch(filterStatusProvider);

  Map<String, dynamic> params = {};
  if (searchQuery.isNotEmpty) {
    params['search'] = searchQuery;
  }
  if (filterStatus != null) {
    params['status'] = filterStatus;
  }

  final response = await api.get('/trpc/webhookDeliveries.list', params: params);
  return (response['data'] as List).map((e) => WebhookDelivery.fromJson(e)).toList();
});

class WebhookDeliveriesScreen extends ConsumerStatefulWidget {
  const WebhookDeliveriesScreen({super.key});

  @override
  ConsumerState<WebhookDeliveriesScreen> createState() => _WebhookDeliveriesScreenState();
}

class _WebhookDeliveriesScreenState extends ConsumerState<WebhookDeliveriesScreen> {
  final TextEditingController _searchController = TextEditingController();

  // Define colors for the dark theme
  static const Color _backgroundColor = Color(0xFF0f172a);
  static const Color _cardColor = Color(0xFF1e293b);
  static const Color _textColor = Color(0xFFf1f5f9);
  static const Color _accentColor = Color(0xFF6366f1);

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
    final webhookDeliveriesAsyncValue = ref.watch(webhookDeliveriesProvider);
    final filterStatus = ref.watch(filterStatusProvider);

    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          decoration: InputDecoration(
            hintText: 'Search Webhook Deliveries...',
            hintStyle: const TextStyle(color: _textColor.withOpacity(0.7)),
            border: InputBorder.none,
            suffixIcon: _searchController.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear, color: _textColor),
                    onPressed: () {
                      _searchController.clear();
                      ref.read(searchQueryProvider.notifier).state = '';
                    },
                  )
                : null,
          ),
          style: const TextStyle(color: _textColor),
        ),
        backgroundColor: _cardColor,
        iconTheme: const IconThemeData(color: _textColor),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list, color: _textColor),
            onSelected: (String? newValue) {
              ref.read(filterStatusProvider.notifier).state = newValue == 'All' ? null : newValue;
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'All',
                child: Text('All Statuses'),
              ),
              const PopupMenuItem<String>(
                value: 'success',
                child: Text('Success'),
              ),
              const PopupMenuItem<String>(
                value: 'failed',
                child: Text('Failed'),
              ),
              const PopupMenuItem<String>(
                value: 'pending',
                child: Text('Pending'),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(webhookDeliveriesProvider);
        },
        child: webhookDeliveriesAsyncValue.when(
          data: (deliveries) {
            if (deliveries.isEmpty) {
              return const Center(
                child: Text(
                  'No webhook deliveries found.',
                  style: TextStyle(color: _textColor),
                ),
              );
            }
            return ListView.builder(
              itemCount: deliveries.length,
              itemBuilder: (context, index) {
                final delivery = deliveries[index];
                return Card(
                  color: _cardColor,
                  margin: const EdgeInsets.all(8.0),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ID: ${delivery.id}', style: const TextStyle(color: _textColor)),
                        Text('Webhook ID: ${delivery.webhookId}', style: const TextStyle(color: _textColor)),
                        _buildStatusBadge(delivery.status),
                        Text('Attempts: ${delivery.attempts}', style: const TextStyle(color: _textColor)),
                        Text('Created At: ${DateFormat.yMd().add_jm().format(delivery.createdAt)}', style: const TextStyle(color: _textColor)),
                        if (delivery.deliveredAt != null)
                          Text('Delivered At: ${DateFormat.yMd().add_jm().format(delivery.deliveredAt!)}', style: const TextStyle(color: _textColor)),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: _accentColor),
                              onPressed: () => _showEditDeliveryDialog(context, delivery),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.redAccent),
                              onPressed: () => _confirmDeleteDelivery(context, delivery.id),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: _accentColor)),
          error: (error, stack) => Center(
            child: Text(
              'Error: $error',
              style: const TextStyle(color: Colors.red),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDeliveryDialog(context),
        backgroundColor: _accentColor,
        child: const Icon(Icons.add, color: _textColor),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color badgeColor;
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
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
    );
  }

  Future<void> _showCreateDeliveryDialog(BuildContext context) async {
    final TextEditingController webhookIdController = TextEditingController();
    final TextEditingController payloadController = TextEditingController();

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Create Webhook Delivery', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: webhookIdController,
                  decoration: const InputDecoration(
                    labelText: 'Webhook ID',
                    labelStyle: TextStyle(color: _textColor),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: payloadController,
                  decoration: const InputDecoration(
                    labelText: 'Payload (JSON)',
                    labelStyle: TextStyle(color: _textColor),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                  maxLines: 5,
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Create', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                // Implement create API call
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/webhookDeliveries.create',
                    body: {
                      'webhookId': webhookIdController.text,
                      'payload': payloadController.text,
                    },
                  );
                  ref.invalidate(webhookDeliveriesProvider);
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to create webhook delivery: $e')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEditDeliveryDialog(BuildContext context, WebhookDelivery delivery) async {
    final TextEditingController webhookIdController = TextEditingController(text: delivery.webhookId);
    final TextEditingController payloadController = TextEditingController(text: delivery.payload);
    final TextEditingController statusController = TextEditingController(text: delivery.status);

    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Edit Webhook Delivery', style: TextStyle(color: _textColor)),
          content: SingleChildScrollView(
            child: ListBody(
              children: <Widget>[
                TextField(
                  controller: webhookIdController,
                  decoration: const InputDecoration(
                    labelText: 'Webhook ID',
                    labelStyle: TextStyle(color: _textColor),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
                TextField(
                  controller: payloadController,
                  decoration: const InputDecoration(
                    labelText: 'Payload (JSON)',
                    labelStyle: TextStyle(color: _textColor),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                  maxLines: 5,
                ),
                TextField(
                  controller: statusController,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    labelStyle: TextStyle(color: _textColor),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: _textColor)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: _accentColor)),
                  ),
                  style: const TextStyle(color: _textColor),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Save', style: TextStyle(color: _accentColor)),
              onPressed: () async {
                // Implement update API call
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/webhookDeliveries.update',
                    body: {
                      'id': delivery.id,
                      'webhookId': webhookIdController.text,
                      'payload': payloadController.text,
                      'status': statusController.text,
                    },
                  );
                  ref.invalidate(webhookDeliveriesProvider);
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to update webhook delivery: $e')),
                  );
                }
              },
            ),
          ],
        );
      },
    );
  }

  Future<void> _confirmDeleteDelivery(BuildContext context, String deliveryId) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: _cardColor,
          title: const Text('Confirm Delete', style: TextStyle(color: _textColor)),
          content: const Text('Are you sure you want to delete this webhook delivery?', style: TextStyle(color: _textColor)),
          actions: <Widget>[
            TextButton(
              child: const Text('Cancel', style: TextStyle(color: _textColor)),
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
            ),
            TextButton(
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
              onPressed: () async {
                // Implement delete API call
                try {
                  await ref.read(apiServiceProvider).post(
                    '/trpc/webhookDeliveries.delete',
                    body: {'id': deliveryId},
                  );
                  ref.invalidate(webhookDeliveriesProvider);
                  Navigator.of(dialogContext).pop();
                } catch (e) {
                  // Handle error
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Failed to delete webhook delivery: $e')),
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
