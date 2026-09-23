import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'app.dart';
import 'services/notification_service.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // System UI
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0f172a),
  ));
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Bootstrap runs in the background so the first frame is never blocked on
  // local storage or network-adjacent initialization.
  final bootstrapFuture = _bootstrap();

  runApp(ProviderScope(child: PayGateApp(bootstrapFuture: bootstrapFuture)));
}

/// Initializes local storage and push notifications off the critical path.
Future<void> _bootstrap() async {
  await Future.wait([
    Hive.initFlutter(),
    () async {
      // Firebase (graceful fallback if not configured)
      try {
        await Firebase.initializeApp();
        await NotificationService.initialize(flutterLocalNotificationsPlugin);
      } catch (e) {
        debugPrint('[Firebase] Not configured: $e');
      }
    }(),
  ]);
}
