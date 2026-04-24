import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/transactions/transactions_screen.dart';
import 'screens/transactions/transaction_detail_screen.dart';
import 'screens/payouts/payouts_screen.dart';
import 'screens/disputes/disputes_screen.dart';
import 'screens/analytics/analytics_screen.dart';
import 'screens/virtual_cards/virtual_cards_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/profile_screen.dart';
import 'screens/cross_border/cross_border_screen.dart';
import 'screens/fraud_risk/fraud_risk_screen.dart';
import 'screens/bnpl/bnpl_screen.dart';
import 'screens/fx/fx_screen.dart';
import 'screens/payment_links/payment_links_screen.dart';
import 'widgets/main_shell.dart';

class PayGateApp extends StatelessWidget {
  const PayGateApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthProvider(),
      child: MaterialApp(
        title: 'PayGate Merchant',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6366F1)),
          useMaterial3: true,
          fontFamily: 'Inter',
        ),
        initialRoute: '/splash',
        routes: {
          '/splash': (_) => const SplashScreen(),
          '/login': (_) => const LoginScreen(),
          '/dashboard': (_) => const MainShell(child: DashboardScreen()),
          '/transactions': (_) => const MainShell(child: TransactionsScreen()),
          '/payouts': (_) => const MainShell(child: PayoutsScreen()),
          '/disputes': (_) => const MainShell(child: DisputesScreen()),
          '/analytics': (_) => const MainShell(child: AnalyticsScreen()),
          '/virtual-cards': (_) => const MainShell(child: VirtualCardsScreen()),
          '/notifications': (_) => const MainShell(child: NotificationsScreen()),
          '/settings': (_) => const MainShell(child: SettingsScreen()),
          '/profile': (_) => const ProfileScreen(),
          '/cross-border': (_) => const MainShell(child: CrossBorderScreen()),
          '/fraud-risk': (_) => const MainShell(child: FraudRiskScreen()),
          '/bnpl': (_) => const MainShell(child: BNPLScreen()),
          '/fx': (_) => const MainShell(child: FXScreen()),
          '/payment-links': (_) => const MainShell(child: PaymentLinksScreen()),
        },
        onGenerateRoute: (settings) {
          if (settings.name?.startsWith('/transaction/') == true) {
            final id = settings.name!.split('/').last;
            return MaterialPageRoute(builder: (_) => TransactionDetailScreen(transactionId: id));
          }
          return MaterialPageRoute(builder: (_) => const SplashScreen());
        },
      ),
    );
  }
}
