import 'dart:convert';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final _fcm = FirebaseMessaging.instance;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  static const _channelId = 'paygate_high';
  static const _channelName = 'PayGate Alerts';

  Future<void> initialize(ApiService api) async {
    // Request permissions
    await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // Setup local notifications
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Create Android notification channel
    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: 'PayGate payment and security alerts',
      importance: Importance.high,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Get FCM token and register with backend
    final token = await _fcm.getToken();
    if (token != null) {
      await _registerToken(api, token);
    }

    // Listen for token refresh
    _fcm.onTokenRefresh.listen((newToken) => _registerToken(api, newToken));

    // Foreground messages
    FirebaseMessaging.onMessage.listen(_showLocalNotification);

    // Background message handler (must be top-level function)
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  }

  Future<void> _registerToken(ApiService api, String token) async {
    try {
      await api.post('/trpc/pushTokens.register', body: {
        'token': token,
        'platform': 'mobile',
        'deviceType': 'fcm',
      });
    } catch (_) {}
  }

  Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: 'PayGate payment and security alerts',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          color: const Color(0xFF3b82f6),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  void _onNotificationTap(NotificationResponse response) {
    // Handle notification tap — navigate based on payload
    if (response.payload != null) {
      try {
        final data = jsonDecode(response.payload!) as Map<String, dynamic>;
        final type = data['type'] as String?;
        // Navigation handled by app router based on type
        // e.g., 'transaction' -> /transactions/:id
        // e.g., 'dispute' -> /disputes/:id
        // e.g., 'payout' -> /payouts/:id
        print('[Notification] Tapped: type=$type data=$data');
      } catch (_) {}
    }
  }

  Future<void> unregister(ApiService api) async {
    final token = await _fcm.getToken();
    if (token != null) {
      try {
        await api.post('/trpc/pushTokens.deregister', body: {'token': token});
      } catch (_) {}
    }
    await _fcm.deleteToken();
  }
}

@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Background message handler — runs in separate isolate
  print('[FCM Background] ${message.messageId}: ${message.notification?.title}');
}
