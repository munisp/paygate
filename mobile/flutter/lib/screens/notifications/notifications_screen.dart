import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<dynamic> _notifications = [];
  bool _loading = true;
  String? _error;
  bool _unreadOnly = false;
  bool _markingAll = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.listNotifications(unreadOnly: _unreadOnly ? true : null);
      final rows = result['rows'] ?? result['notifications'] ?? result['data'] ?? [];
      setState(() { _notifications = rows is List ? rows : []; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _markRead(int id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.markNotificationRead(id);
      setState(() {
        final idx = _notifications.indexWhere((n) => (n['id'] as int?) == id);
        if (idx >= 0) _notifications[idx] = {..._notifications[idx], 'read': true, 'read_at': DateTime.now().toIso8601String()};
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _markAllRead() async {
    setState(() => _markingAll = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.markAllNotificationsRead();
      setState(() {
        _notifications = _notifications.map((n) => {...n, 'read': true}).toList();
        _markingAll = false;
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('All marked as read')));
    } catch (e) {
      setState(() => _markingAll = false);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  IconData _typeIcon(String type) {
    switch (type) {
      case 'payment': return Icons.payment;
      case 'dispute': return Icons.warning;
      case 'fraud': return Icons.security;
      case 'payout': return Icons.account_balance_wallet;
      case 'kyc': return Icons.person_pin;
      case 'system': return Icons.settings;
      default: return Icons.notifications;
    }
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'payment': return Colors.green;
      case 'dispute': return Colors.orange;
      case 'fraud': return Colors.red;
      case 'payout': return Colors.blue;
      case 'kyc': return Colors.purple;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => !(n['read'] as bool? ?? false)).length;
    return Scaffold(
      appBar: AppBar(
        title: Text('Notifications${unreadCount > 0 ? ' ($unreadCount)' : ''}'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [
          if (unreadCount > 0)
            _markingAll
              ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)))
              : TextButton(
                  onPressed: _markAllRead,
                  child: const Text('Mark all read', style: TextStyle(color: Colors.white)),
                ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: Column(
        children: [
          // Filter toggle
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Text('Unread only'),
                const Spacer(),
                Switch(
                  value: _unreadOnly,
                  onChanged: (v) { setState(() => _unreadOnly = v); _load(); },
                  activeColor: const Color(0xFF6366F1),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                ? Center(child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 12),
                      Text(_error!),
                      ElevatedButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ))
                : _notifications.isEmpty
                  ? const Center(child: Text('No notifications'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _notifications.length,
                        itemBuilder: (ctx, i) {
                          final n = _notifications[i];
                          final isRead = n['read'] as bool? ?? false;
                          final type = n['type'] as String? ?? 'system';
                          return Dismissible(
                            key: Key('notif_${n['id']}'),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              color: Colors.green,
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.only(right: 16),
                              child: const Icon(Icons.check, color: Colors.white),
                            ),
                            onDismissed: (_) => _markRead(n['id'] as int),
                            child: Container(
                              color: isRead ? null : const Color(0xFF6366F1).withOpacity(0.05),
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: _typeColor(type).withOpacity(0.15),
                                  child: Icon(_typeIcon(type), color: _typeColor(type), size: 20),
                                ),
                                title: Text(n['title'] ?? 'Notification',
                                  style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.bold)),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(n['body'] ?? n['message'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                                    Text(n['created_at'] ?? '', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                  ],
                                ),
                                trailing: !isRead
                                  ? Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFF6366F1), shape: BoxShape.circle))
                                  : null,
                                onTap: isRead ? null : () => _markRead(n['id'] as int),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
          ),
        ],
      ),
    );
  }
}
