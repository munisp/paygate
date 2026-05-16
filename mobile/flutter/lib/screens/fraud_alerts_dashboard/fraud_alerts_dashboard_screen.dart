import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';

class FraudAlertsDashboardScreen extends ConsumerStatefulWidget {
  const FraudAlertsDashboardScreen({super.key});

  @override
  ConsumerState<FraudAlertsDashboardScreen> createState() => _FraudAlertsDashboardScreenState();
}

class _FraudAlertsDashboardScreenState extends ConsumerState<FraudAlertsDashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final Color backgroundColor = Color(0xFF0f172a);
    final Color cardColor = Color(0xFF1e293b);
    final Color textColor = Color(0xFFf1f5f9);
    final Color accentColor = Color(0xFF6366f1);

    return Scaffold(
      backgroundColor: backgroundColor,
      appBar: AppBar(
        title: Text(
          'Fraud Alerts Dashboard',
          style: TextStyle(color: textColor),
        ),
        backgroundColor: backgroundColor,
        iconTheme: IconThemeData(color: textColor), // For back button
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // TODO: Implement refresh logic
        },
        child: Center(
          child: Text(
            'Fraud Alerts Content Goes Here',
            style: TextStyle(color: textColor),
          ),
        ),
      ),
    );
  }
}