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
import 'screens/virtual_cards/virtual_cards_full_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/notifications/notification_preferences_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/profile_screen.dart';
import 'screens/profile/profile_screen.dart' as profile_main;
import 'screens/cross_border/cross_border_screen.dart';
import 'screens/fraud_risk/fraud_risk_screen.dart';
import 'screens/bnpl/bnpl_screen.dart';
import 'screens/fx/fx_screen.dart';
import 'screens/payment_links/payment_links_screen.dart';
import 'screens/webhooks/webhooks_screen.dart';
import 'screens/customers/customers_screen.dart';
import 'screens/compliance/compliance_screen.dart';
import 'screens/qr_payments/qr_payments_screen.dart';
import 'screens/reconciliation/reconciliation_screen.dart';
import 'screens/settlements/settlements_screen.dart';
import 'screens/billing/billing_engine_screen.dart';
import 'screens/billing/billing_analytics_screen.dart';
import 'screens/staff_management/staff_management_screen.dart';
import 'screens/insurance_claims/insurance_claims_screen.dart';
import 'screens/support_chat/support_chat_screen.dart';
import 'screens/usdc_v3/usdc_v3_screen.dart';
import 'screens/tax_filing_v2/tax_filing_v2_screen.dart';
import 'screens/split_bill_v2/split_bill_v2_screen.dart';
// Wave 121 imports
import 'screens/fee_schedules/fee_schedules_screen.dart';
import 'screens/chargeback_cases/chargeback_cases_screen.dart';
import 'screens/fraud_rules/fraud_rules_screen.dart';
import 'screens/kyb_verifications/kyb_verifications_screen.dart';
import 'screens/invoice_financing/invoice_financing_screen.dart';
import 'screens/loyalty_v3/loyalty_v3_screen.dart';
import 'screens/tenant_provisioning/tenant_provisioning_screen.dart';
import 'screens/audit_log_viewer/audit_log_viewer_screen.dart';
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
          '/notification-preferences': (_) => const MainShell(child: NotificationPreferencesScreen()),
          '/settings': (_) => const MainShell(child: SettingsScreen()),
          '/profile': (_) => const ProfileScreen(),
          '/profile-main': (_) => const profile_main.ProfileScreen(),
          '/cross-border': (_) => const MainShell(child: CrossBorderScreen()),
          '/fraud-risk': (_) => const MainShell(child: FraudRiskScreen()),
          '/bnpl': (_) => const MainShell(child: BNPLScreen()),
          '/fx': (_) => const MainShell(child: FXScreen()),
          '/payment-links': (_) => const MainShell(child: PaymentLinksScreen()),
          '/webhooks': (_) => const MainShell(child: WebhooksScreen()),
          '/customers': (_) => const MainShell(child: CustomersScreen()),
          '/compliance': (_) => const MainShell(child: ComplianceScreen()),
          '/qr-payments': (_) => const MainShell(child: QRPaymentsScreen()),
          '/reconciliation': (_) => const MainShell(child: ReconciliationScreen()),
          '/settlements': (_) => const MainShell(child: SettlementsScreen()),
          '/billing-engine': (_) => const MainShell(child: BillingEngineScreen()),
          '/billing-analytics': (_) => const MainShell(child: BillingAnalyticsScreen()),
          '/staff-management': (_) => const MainShell(child: StaffManagementScreen()),
          '/insurance-claims': (_) => const MainShell(child: InsuranceClaimsScreen()),
          '/support-chat': (_) => const MainShell(child: SupportChatScreen()),
          '/usdc-v3': (_) => const MainShell(child: UsdcV3Screen()),
          '/tax-filing-v2': (_) => const MainShell(child: TaxFilingV2Screen()),
          '/split-bill-v2': (_) => const MainShell(child: SplitBillV2Screen()),
          // Wave 121 routes
          '/fee-schedules': (_) => const MainShell(child: FeeSchedulesScreen()),
          '/chargeback-cases': (_) => const MainShell(child: ChargebackCasesScreen()),
          '/fraud-rules': (_) => const MainShell(child: FraudRulesScreen()),
          '/kyb-verifications': (_) => const MainShell(child: KybVerificationsScreen()),
          '/invoice-financing': (_) => const MainShell(child: InvoiceFinancingScreen()),
          '/loyalty-v3': (_) => const MainShell(child: LoyaltyV3Screen()),
          '/tenant-provisioning': (_) => const MainShell(child: TenantProvisioningScreen()),
          '/audit-log': (_) => const MainShell(child: AuditLogViewerScreen()),
        },
        onGenerateRoute: (settings) {
          if (settings.name?.startsWith('/transaction/') == true) {
            final id = settings.name!.split('/').last;
            return MaterialPageRoute(
              builder: (_) => TransactionDetailScreen(transactionId: id),
            );
          }
          if (settings.name?.startsWith('/virtual-cards/') == true) {
            final id = settings.name!.split('/').last;
            return MaterialPageRoute(
              builder: (_) => VirtualCardsFullScreen(cardId: id),
            );
          }
          return MaterialPageRoute(builder: (_) => const SplashScreen());
        },
      ),
    );
  }
}
