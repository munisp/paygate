/// AppNavigator — centralised route management for the PayGate Flutter app.
///
/// Responsibilities:
///   - Defines all named routes as constants.
///   - Provides a [RouteGuard] that redirects unauthenticated users to the
///     login screen and biometric-pending users to the biometric prompt.
///   - Exposes helper methods for common navigation patterns (push, replace,
///     popToRoot, deepLink).
///
/// Usage:
///   ```dart
///   // In MaterialApp:
///   MaterialApp(
///     navigatorKey: AppNavigator.navigatorKey,
///     onGenerateRoute: AppNavigator.onGenerateRoute,
///     initialRoute: AppNavigator.splash,
///   )
///
///   // Navigate from anywhere:
///   AppNavigator.push(context, AppNavigator.dashboard);
///   AppNavigator.replace(context, AppNavigator.login);
///   ```
library app_navigator;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../screens/auth/login_screen.dart';
import '../screens/auth/splash_screen.dart';
import '../screens/dashboard/dashboard_screen.dart';
import '../screens/transactions/transactions_screen.dart';
import '../screens/payouts/payouts_screen.dart';
import '../screens/analytics/analytics_screen.dart';
import '../screens/settings/settings_screen.dart';
import '../screens/compliance/compliance_screen.dart';
import '../screens/fraud_risk/fraud_risk_screen.dart';
import '../screens/virtual_cards/virtual_cards_screen.dart';
import '../screens/customers/customers_screen.dart';
import '../screens/payment_links/payment_links_screen.dart';
import '../screens/disputes/disputes_screen.dart';
import '../screens/cross_border/cross_border_screen.dart';
import '../screens/fx/fx_screen.dart';
import '../screens/bnpl/bnpl_screen.dart';
import '../screens/qr_payments/qr_payments_screen.dart';
import '../screens/settlements/settlements_screen.dart';
import '../screens/reconciliation/reconciliation_screen.dart';
import '../screens/billing/billing_engine_screen.dart';
import '../screens/crypto/crypto_wallet_screen.dart';
import '../screens/insider_threat/insider_threat_screen.dart';
import '../screens/active_sessions/active_sessions_screen.dart';
import 'biometric_gate_screen.dart';

/// All named routes in the PayGate app.
abstract class AppRoutes {
  // ── Auth ──────────────────────────────────────────────────────────────────
  static const String splash = '/';
  static const String login = '/login';
  static const String biometricGate = '/biometric-gate';

  // ── Core ──────────────────────────────────────────────────────────────────
  static const String dashboard = '/dashboard';
  static const String transactions = '/transactions';
  static const String payouts = '/payouts';
  static const String analytics = '/analytics';
  static const String settings = '/settings';

  // ── Compliance & Security ─────────────────────────────────────────────────
  static const String compliance = '/compliance';
  static const String fraudRisk = '/fraud-risk';
  static const String insiderThreat = '/insider-threat';
  static const String activeSessions = '/active-sessions';

  // ── Products ──────────────────────────────────────────────────────────────
  static const String virtualCards = '/virtual-cards';
  static const String customers = '/customers';
  static const String paymentLinks = '/payment-links';
  static const String disputes = '/disputes';
  static const String crossBorder = '/cross-border';
  static const String fx = '/fx';
  static const String bnpl = '/bnpl';
  static const String qrPayments = '/qr-payments';
  static const String settlements = '/settlements';
  static const String reconciliation = '/reconciliation';
  static const String billing = '/billing';
  static const String crypto = '/crypto';
}

/// Routes that require the user to be authenticated.
const _protectedRoutes = {
  AppRoutes.dashboard,
  AppRoutes.transactions,
  AppRoutes.payouts,
  AppRoutes.analytics,
  AppRoutes.settings,
  AppRoutes.compliance,
  AppRoutes.fraudRisk,
  AppRoutes.insiderThreat,
  AppRoutes.activeSessions,
  AppRoutes.virtualCards,
  AppRoutes.customers,
  AppRoutes.paymentLinks,
  AppRoutes.disputes,
  AppRoutes.crossBorder,
  AppRoutes.fx,
  AppRoutes.bnpl,
  AppRoutes.qrPayments,
  AppRoutes.settlements,
  AppRoutes.reconciliation,
  AppRoutes.billing,
  AppRoutes.crypto,
};

class AppNavigator {
  AppNavigator._();

  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  static final _secureStorage = const FlutterSecureStorage();

  // ── Route generation ───────────────────────────────────────────────────────

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final routeName = settings.name ?? AppRoutes.splash;
    final args = settings.arguments;

    // Route guard: redirect unauthenticated users
    if (_protectedRoutes.contains(routeName)) {
      return _guardedRoute(routeName, args);
    }

    return _buildRoute(routeName, args);
  }

  static Route<dynamic> _guardedRoute(String routeName, Object? args) {
    // We use a FutureBuilder-based wrapper to check auth state asynchronously.
    return MaterialPageRoute(
      settings: RouteSettings(name: routeName),
      builder: (_) => _AuthGuard(
        targetRoute: routeName,
        targetArgs: args,
      ),
    );
  }

  static Route<dynamic> _buildRoute(String routeName, Object? args) {
    Widget page;
    switch (routeName) {
      case AppRoutes.splash:
        page = const SplashScreen();
        break;
      case AppRoutes.login:
        page = const LoginScreen();
        break;
      case AppRoutes.biometricGate:
        page = const BiometricGateScreen();
        break;
      case AppRoutes.dashboard:
        page = const DashboardScreen();
        break;
      case AppRoutes.transactions:
        page = const TransactionsScreen();
        break;
      case AppRoutes.payouts:
        page = const PayoutsScreen();
        break;
      case AppRoutes.analytics:
        page = const AnalyticsScreen();
        break;
      case AppRoutes.settings:
        page = const SettingsScreen();
        break;
      case AppRoutes.compliance:
        page = const ComplianceScreen();
        break;
      case AppRoutes.fraudRisk:
        page = const FraudRiskScreen();
        break;
      case AppRoutes.insiderThreat:
        page = const InsiderThreatScreen();
        break;
      case AppRoutes.activeSessions:
        page = const ActiveSessionsScreen();
        break;
      case AppRoutes.virtualCards:
        page = const VirtualCardsScreen();
        break;
      case AppRoutes.customers:
        page = const CustomersScreen();
        break;
      case AppRoutes.paymentLinks:
        page = const PaymentLinksScreen();
        break;
      case AppRoutes.disputes:
        page = const DisputesScreen();
        break;
      case AppRoutes.crossBorder:
        page = const CrossBorderScreen();
        break;
      case AppRoutes.fx:
        page = const FxScreen();
        break;
      case AppRoutes.bnpl:
        page = const BnplScreen();
        break;
      case AppRoutes.qrPayments:
        page = const QrPaymentsScreen();
        break;
      case AppRoutes.settlements:
        page = const SettlementsScreen();
        break;
      case AppRoutes.reconciliation:
        page = const ReconciliationScreen();
        break;
      case AppRoutes.billing:
        page = const BillingEngineScreen();
        break;
      case AppRoutes.crypto:
        page = const CryptoWalletScreen();
        break;
      default:
        page = _NotFoundPage(routeName: routeName);
    }

    return MaterialPageRoute(
      settings: RouteSettings(name: routeName, arguments: args),
      builder: (_) => page,
    );
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────

  /// Push a named route onto the stack.
  static Future<T?> push<T>(BuildContext context, String routeName,
      {Object? arguments}) {
    return Navigator.of(context)
        .pushNamed<T>(routeName, arguments: arguments);
  }

  /// Replace the current route.
  static Future<T?> replace<T>(BuildContext context, String routeName,
      {Object? arguments}) {
    return Navigator.of(context)
        .pushReplacementNamed<T, dynamic>(routeName, arguments: arguments);
  }

  /// Pop all routes and navigate to [routeName].
  static Future<T?> popToRoot<T>(BuildContext context, String routeName,
      {Object? arguments}) {
    return Navigator.of(context)
        .pushNamedAndRemoveUntil<T>(routeName, (_) => false,
            arguments: arguments);
  }

  /// Pop the current route.
  static void pop<T>(BuildContext context, [T? result]) {
    Navigator.of(context).pop<T>(result);
  }

  // ── Auth state helpers ─────────────────────────────────────────────────────

  static Future<bool> _isAuthenticated() async {
    final token = await _secureStorage.read(key: 'paygate_access_token');
    return token != null && token.isNotEmpty;
  }

  static Future<bool> _isBiometricPending() async {
    final pending =
        await _secureStorage.read(key: 'paygate_biometric_pending');
    return pending == 'true';
  }
}

// ── Auth guard widget ─────────────────────────────────────────────────────────

class _AuthGuard extends StatefulWidget {
  final String targetRoute;
  final Object? targetArgs;

  const _AuthGuard({required this.targetRoute, this.targetArgs});

  @override
  State<_AuthGuard> createState() => _AuthGuardState();
}

class _AuthGuardState extends State<_AuthGuard> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final isAuth = await AppNavigator._isAuthenticated();
    if (!mounted) return;

    if (!isAuth) {
      // Not authenticated — redirect to login
      AppNavigator.replace(context, AppRoutes.login);
      return;
    }

    final isBiometricPending = await AppNavigator._isBiometricPending();
    if (!mounted) return;

    if (isBiometricPending) {
      // Biometric re-authentication required (e.g. after app foreground)
      AppNavigator.replace(context, AppRoutes.biometricGate,
          arguments: {'return_route': widget.targetRoute});
      return;
    }

    // Authenticated — navigate to the target route
    if (mounted) {
      Navigator.of(context).pushReplacementNamed(
        widget.targetRoute,
        arguments: widget.targetArgs,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF0A0A0F),
      body: Center(
        child: CircularProgressIndicator(
          color: Color(0xFF6C63FF),
        ),
      ),
    );
  }
}

// ── 404 page ──────────────────────────────────────────────────────────────────

class _NotFoundPage extends StatelessWidget {
  final String routeName;
  const _NotFoundPage({required this.routeName});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Color(0xFF6C63FF), size: 64),
            const SizedBox(height: 16),
            Text(
              'Route not found: $routeName',
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () =>
                  AppNavigator.popToRoot(context, AppRoutes.dashboard),
              child: const Text('Go to Dashboard'),
            ),
          ],
        ),
      ),
    );
  }
}
