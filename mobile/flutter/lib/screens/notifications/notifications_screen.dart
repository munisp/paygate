import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.get('/trpc/notifications.list?input={"limit":50}');
      final items = (data['result']?['data']?['notifications'] as List?) ?? [];
      setState(() {
        _notifications = items.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _markRead(int id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.post('/trpc/notifications.markRead', {'id': id});
      setState(() {
        final idx = _notifications.indexWhere((n) => n['id'] == id);
        if (idx != -1) _notifications[idx] = {..._notifications[idx], 'isRead': true};
      });
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1e293b),
        title: const Text('Mark All Read', style: TextStyle(color: Colors.white)),
        content: const Text('Mark all notifications as read?', style: TextStyle(color: Color(0xFF94a3b8))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Mark All Read', style: TextStyle(color: Color(0xFF6366f1)))),
        ],
      ),
    );
    if (confirm == true) {
      try {
        final api = ref.read(apiServiceProvider);
        await api.post('/trpc/notifications.markAllRead', {});
        setState(() {
          _notifications = _notifications.map((n) => {...n, 'isRead': true}).toList();
        });
      } catch (_) {}
    }
  }

  String _getIcon(String type) {
    switch (type) {
      case 'payment': return '💳';
      case 'payout': return '💸';
      case 'dispute': return '⚠️';
      case 'fraud': return '🚨';
      case 'kyc': return '🪪';
      default: return '🔔';
    }
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => n['isRead'] != true).length;

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1e293b),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Notifications', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
            if (unreadCount > 0)
              Text('$unreadCount unread', style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 12)),
          ],
        ),
        actions: [
          if (unreadCount > 0)
            TextButton(
              onPressed: _markAllRead,
              child: const Text('Mark all read', style: TextStyle(color: Color(0xFF6366f1), fontSize: 13)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366f1)))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFef4444), size: 48),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: Color(0xFF94a3b8))),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadNotifications, child: const Text('Retry')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  color: const Color(0xFF6366f1),
                  child: _notifications.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 80),
                            Center(
                              child: Column(
                                children: [
                                  Text('🔔', style: TextStyle(fontSize: 48)),
                                  SizedBox(height: 16),
                                  Text('No notifications yet', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
                                  SizedBox(height: 8),
                                  Padding(
                                    padding: EdgeInsets.symmetric(horizontal: 32),
                                    child: Text(
                                      'Payment updates, dispute alerts, and system messages will appear here.',
                                      style: TextStyle(color: Color(0xFF94a3b8), fontSize: 14),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          itemCount: _notifications.length,
                          itemBuilder: (context, index) {
                            final n = _notifications[index];
                            final isRead = n['isRead'] == true;
                            return InkWell(
                              onTap: () => _markRead(n['id'] as int),
                              child: Container(
                                color: isRead ? const Color(0xFF0f172a) : const Color(0xFF1e293b),
                                padding: const EdgeInsets.all(16),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF334155),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Center(
                                        child: Text(_getIcon(n['type'] ?? ''), style: const TextStyle(fontSize: 18)),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            n['title'] ?? '',
                                            style: TextStyle(
                                              color: Colors.white,
                                              fontWeight: isRead ? FontWeight.normal : FontWeight.w700,
                                              fontSize: 15,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 3),
                                          Text(
                                            n['body'] ?? '',
                                            style: const TextStyle(color: Color(0xFF94a3b8), fontSize: 13),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            n['createdAt'] != null ? _formatTime(n['createdAt'].toString()) : '',
                                            style: const TextStyle(color: Color(0xFF64748b), fontSize: 11),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (!isRead)
                                      Container(
                                        width: 8,
                                        height: 8,
                                        margin: const EdgeInsets.only(top: 4, left: 8),
                                        decoration: const BoxDecoration(
                                          color: Color(0xFF6366f1),
                                          shape: BoxShape.circle,
                                        ),
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

  String _formatTime(String isoString) {
    try {
      final dt = DateTime.parse(isoString);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return isoString;
    }
  }
}
