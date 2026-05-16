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
// Wave 122 imports
import 'screens/fraud_rule_engine/fraud_rule_engine_screen.dart';
import 'screens/kyb_document_upload/kyb_document_upload_screen.dart';
import 'screens/loyalty_redemption/loyalty_redemption_screen.dart';
// Wave 123 imports
import 'screens/payroll/payroll_screen.dart';
import 'screens/fx_dashboard/fx_dashboard_screen.dart';
import 'screens/checkout/checkout_screen.dart';
import 'screens/api_keys/api_keys_screen.dart';
import 'screens/team_roles/team_roles_screen.dart';
import 'screens/mobile_money_recon/mobile_money_recon_screen.dart';
import 'widgets/main_shell.dart';
// Wave 159+ imports
import 'screens/admin/admin_audit_log_screen.dart';
import 'screens/admin/admin_fraud_oversight_screen.dart';
import 'screens/admin/admin_kyc_review_screen.dart';
import 'screens/admin/admin_merchant_management_screen.dart';
import 'screens/admin/admin_payout_approval_screen.dart';
import 'screens/ai/ai_insights_screen.dart';
import 'screens/api_keys/a_p_i_keys_screen.dart';
import 'screens/bill_payments/bill_payments_screen.dart';
import 'screens/carbon_credits/carbon_credits_screen.dart';
import 'screens/chargebacks/chargebacks_screen.dart';
import 'screens/compliance/aml_monitor_screen.dart';
import 'screens/coupons/coupons_screen.dart';
import 'screens/crypto/crypto_wallet_screen.dart';
import 'screens/digital_gold/digital_gold_screen.dart';
import 'screens/escrow/escrow_accounts_screen.dart';
import 'screens/fx_dashboard/f_x_dashboard_screen.dart';
import 'screens/gift_cards/gift_cards_screen.dart';
import 'screens/insurance/insurance_policies_screen.dart';
import 'screens/invoices/invoices_screen.dart';
import 'screens/kyb_document_upload/k_y_b_document_upload_screen.dart';
import 'screens/kyb_verifications/k_y_b_verifications_screen.dart';
import 'screens/loyalty/loyalty_program_screen.dart';
import 'screens/mobile_money/mobile_money_recon_screen.dart';
import 'screens/nip/nip_transfers_screen.dart';
import 'screens/pos/pos_terminals_screen.dart';
import 'screens/qr_payments/q_r_payments_screen.dart';
import 'screens/referrals/referrals_screen.dart';
import 'screens/sip/sip_investments_screen.dart';
import 'screens/subscriptions/subscriptions_screen.dart';
import 'screens/team/team_roles_screen.dart';
import 'screens/transaction_receipts/transaction_receipts_screen.dart';
import 'screens/ussd/ussd_services_screen.dart';
import 'screens/webhook_sim_v2/webhook_sim_v2_screen.dart';
import 'screens/aml_monitor/aml_monitor_screen.dart';
import 'screens/agent_banking/agent_banking_screen.dart';
import 'screens/billing_engine/billing_engine_screen.dart';
import 'screens/admin_kyc_review/admin_kyc_review_screen.dart';
import 'screens/admin_fraud_oversight/admin_fraud_oversight_screen.dart';
import 'screens/admin_payout_approval/admin_payout_approval_screen.dart';
import 'screens/ai_insights_v2/a_i_insights_v2_screen.dart';
import 'screens/ai_model_admin/a_i_model_admin_screen.dart';
import 'screens/api_docs_portal_screen/a_p_i_docs_portal_screen.dart';
import 'screens/active_sessions/active_sessions_screen.dart';
import 'screens/auth_events/auth_events_screen.dart';
import 'screens/bnpl_calculator/b_n_p_l_calculator_screen.dart';
import 'screens/bnpl_repayment_page/b_n_p_l_repayment_page_screen.dart';
import 'screens/billing_config/billing_config_screen.dart';
import 'screens/bnpl_repayment_tracker/bnpl_repayment_tracker_screen.dart';
import 'screens/bulk_collections/bulk_collections_screen.dart';
import 'screens/cips_gateway/c_i_p_s_gateway_screen.dart';
import 'screens/carbon_credits_ledger/carbon_credits_ledger_screen.dart';
import 'screens/cashback_rewards/cashback_rewards_screen.dart';
import 'screens/claim_documents/claim_documents_screen.dart';
import 'screens/compliance_kyc/compliance_k_y_c_screen.dart';
import 'screens/compliance_reports/compliance_reports_screen.dart';
import 'screens/compliance_settings/compliance_settings_screen.dart';
import 'screens/consumer_analytics/consumer_analytics_screen.dart';
import 'screens/consumer_disputes/consumer_disputes_screen.dart';
import 'screens/consumer_insurance/consumer_insurance_screen.dart';
import 'screens/consumer_loans/consumer_loans_screen.dart';
import 'screens/consumer_loyalty_app/consumer_loyalty_app_screen.dart';
import 'screens/corridor_live_stats/corridor_live_stats_screen.dart';
import 'screens/corridor_management/corridor_management_screen.dart';
import 'screens/coupon_management/coupon_management_screen.dart';
import 'screens/cross_border_rail_monitor/cross_border_rail_monitor_screen.dart';
import 'screens/data_export/data_export_screen.dart';
import 'screens/developer_portal/developer_portal_screen.dart';
import 'screens/developer_sandbox/developer_sandbox_screen.dart';
import 'screens/dispute_escalation/dispute_escalation_screen.dart';
import 'screens/dispute_workflow/dispute_workflow_screen.dart';
import 'screens/emi_checkout/e_m_i_checkout_screen.dart';
import 'screens/emi_loans_page/e_m_i_loans_page_screen.dart';
import 'screens/emi_management/e_m_i_management_screen.dart';
import 'screens/escrow_contracts/escrow_contracts_screen.dart';
import 'screens/fraud_alert_comments/fraud_alert_comments_screen.dart';
import 'screens/fraud_alerts_dashboard/fraud_alerts_dashboard_screen.dart';
import 'screens/fx_hedging_workflow/fx_hedging_workflow_screen.dart';
import 'screens/geofence_alerts/geofence_alerts_screen.dart';
import 'screens/go_live_checklist/go_live_checklist_screen.dart';
import 'screens/gold_sip/gold_s_i_p_screen.dart';
import 'screens/insurance_hub/insurance_hub_screen.dart';
import 'screens/insurance_page/insurance_page_screen.dart';
import 'screens/international_remittance/international_remittance_screen.dart';
import 'screens/inventory/inventory_screen.dart';
import 'screens/kyb_verification/k_y_b_verification_screen.dart';
import 'screens/keycloak_role_sync/keycloak_role_sync_screen.dart';
import 'screens/kiosk_health/kiosk_health_screen.dart';
import 'screens/kitchen_display/kitchen_display_screen.dart';
import 'screens/lakehouse_ai_dashboard/lakehouse_a_i_dashboard_screen.dart';
import 'screens/liveness_check/liveness_check_screen.dart';
import 'screens/loan_repayments/loan_repayments_screen.dart';
import 'screens/loyalty_auto_promotion/loyalty_auto_promotion_screen.dart';
import 'screens/loyalty_dashboard/loyalty_dashboard_screen.dart';
import 'screens/loyalty_ledger/loyalty_ledger_screen.dart';
import 'screens/market_data_dashboard/market_data_dashboard_screen.dart';
import 'screens/menu_management/menu_management_screen.dart';
import 'screens/merchant_analytics_dashboard/merchant_analytics_dashboard_screen.dart';
import 'screens/merchant_lending/merchant_lending_screen.dart';
import 'screens/merchant_notification_preferences/merchant_notification_preferences_screen.dart';
import 'screens/microservice_health/microservice_health_screen.dart';
import 'screens/middleware_dashboard/middleware_dashboard_screen.dart';
import 'screens/mobile_pos/mobile_p_o_s_screen.dart';
import 'screens/mojaloop_dashboard/mojaloop_dashboard_screen.dart';
import 'screens/mutual_funds/mutual_funds_screen.dart';
import 'screens/nip_banks/n_i_p_banks_screen.dart';
import 'screens/nodal_accounts/nodal_accounts_screen.dart';
import 'screens/notifications_center/notifications_center_screen.dart';
import 'screens/ollama_chat/ollama_chat_screen.dart';
import 'screens/pix_gateway/p_i_x_gateway_screen.dart';
import 'screens/pos_reconciliation/p_o_s_reconciliation_screen.dart';
import 'screens/pos_terminals/p_o_s_terminals_screen.dart';
import 'screens/pos_transactions/p_o_s_transactions_screen.dart';
import 'screens/ptsp_settlement/p_t_s_p_settlement_screen.dart';
import 'screens/partner_admin_dashboard/partner_admin_dashboard_screen.dart';
import 'screens/partner_onboard/partner_onboard_screen.dart';
import 'screens/payout_batching/payout_batching_screen.dart';
import 'screens/pension_nps/pension_n_p_s_screen.dart';
import 'screens/portal_health_dashboard/portal_health_dashboard_screen.dart';
import 'screens/portfolio_rebalancing/portfolio_rebalancing_screen.dart';
import 'screens/pricing_page/pricing_page_screen.dart';
import 'screens/privacy_payments/privacy_payments_screen.dart';
import 'screens/ptsp_batches/ptsp_batches_screen.dart';
import 'screens/purchase_orders/purchase_orders_screen.dart';
import 'screens/qr_generator/q_r_generator_screen.dart';
import 'screens/quick_pay/quick_pay_screen.dart';
import 'screens/rate_limit_dashboard/rate_limit_dashboard_screen.dart';
import 'screens/reconciliation_alerts/reconciliation_alerts_screen.dart';
import 'screens/red_envelopes/red_envelopes_screen.dart';
import 'screens/referral_program/referral_program_screen.dart';
import 'screens/refund_workflow/refund_workflow_screen.dart';
import 'screens/remittance_tracker/remittance_tracker_screen.dart';
import 'screens/reports_center/reports_center_screen.dart';
import 'screens/restaurant_floor_plan/restaurant_floor_plan_screen.dart';
import 'screens/restaurant_loyalty/restaurant_loyalty_screen.dart';
import 'screens/restaurant_menu/restaurant_menu_screen.dart';
import 'screens/restaurant_online_ordering/restaurant_online_ordering_screen.dart';
import 'screens/restaurant_orders/restaurant_orders_screen.dart';
import 'screens/sdk_tokens/s_d_k_tokens_screen.dart';
import 'screens/salary_accounts/salary_accounts_screen.dart';
import 'screens/saved_beneficiaries/saved_beneficiaries_screen.dart';
import 'screens/settings_payments/settings_payments_screen.dart';
import 'screens/settlement_forecast/settlement_forecast_screen.dart';
import 'screens/settlement_sla/settlement_s_l_a_screen.dart';
import 'screens/sla_alert_dashboard/sla_alert_dashboard_screen.dart';
import 'screens/sla_breaches/sla_breaches_screen.dart';
import 'screens/smart_retail_pos/smart_retail_p_o_s_screen.dart';
import 'screens/split_payments/split_payments_screen.dart';
import 'screens/stripe_subscriptions/stripe_subscriptions_screen.dart';
import 'screens/subscription_billing_v2/subscription_billing_v2_screen.dart';
import 'screens/subscription_management/subscription_management_screen.dart';
import 'screens/subscriptions_page/subscriptions_page_screen.dart';
import 'screens/super_agent_management/super_agent_management_screen.dart';
import 'screens/support_admin/support_admin_screen.dart';
import 'screens/tax_engine/tax_engine_screen.dart';
import 'screens/tenant_admin_dashboard/tenant_admin_dashboard_screen.dart';
import 'screens/tenant_api_keys/tenant_api_keys_screen.dart';
import 'screens/tenant_billing_cron/tenant_billing_cron_screen.dart';
import 'screens/tenant_billing_dashboard/tenant_billing_dashboard_screen.dart';
import 'screens/tenant_branding_admin/tenant_branding_admin_screen.dart';
import 'screens/tenant_sso_config/tenant_sso_config_screen.dart';
import 'screens/tenant_stripe_billing/tenant_stripe_billing_screen.dart';
import 'screens/terminal_map/terminal_map_screen.dart';
import 'screens/transaction_receipts_v2/transaction_receipts_v2_screen.dart';
import 'screens/upi_gateway/u_p_i_gateway_screen.dart';
import 'screens/usdc_payouts/u_s_d_c_payouts_screen.dart';
import 'screens/ussd_sessions/u_s_s_d_sessions_screen.dart';
import 'screens/ussd_menu_builder/ussd_menu_builder_screen.dart';
import 'screens/vendors_screen/vendors_screen.dart';
import 'screens/voice_payments/voice_payments_screen.dart';
import 'screens/waf_alert_dashboard/w_a_f_alert_dashboard_screen.dart';
import 'screens/wealth_management/wealth_management_screen.dart';
import 'screens/webhook_deliveries/webhook_deliveries_screen.dart';
import 'screens/webhook_events_page/webhook_events_page_screen.dart';
import 'screens/webhook_live_stream/webhook_live_stream_screen.dart';
import 'screens/webhook_simulator_v2/webhook_simulator_v2_screen.dart';
import 'screens/white_label_preview/white_label_preview_screen.dart';
import 'screens/white_label_sdk/white_label_s_d_k_screen.dart';
import 'screens/workflow_observability/workflow_observability_screen.dart';

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
          // Wave 122 routes
          '/fraud-rule-engine': (_) => const MainShell(child: FraudRuleEngineScreen()),
          '/kyb-document-upload': (_) => const MainShell(child: KYBDocumentUploadScreen()),
          '/loyalty-redemption': (_) => const MainShell(child: LoyaltyRedemptionScreen()),
          // Wave 123 routes
          '/payroll': (_) => const MainShell(child: PayrollScreen()),
          '/fx-dashboard': (_) => const MainShell(child: FxDashboardScreen()),
          '/checkout': (_) => const MainShell(child: CheckoutScreen()),
          '/api-keys': (_) => const MainShell(child: ApiKeysScreen()),
          '/team-roles': (_) => const MainShell(child: TeamRolesScreen()),
          '/mobile-money-recon': (_) => const MainShell(child: MobileMoneyReconScreen()),
          // Wave 159+ routes
          '/admin-audit-log': (_) => const MainShell(child: AdminAuditLogScreen()),
          '/admin-fraud-oversight': (_) => const MainShell(child: AdminFraudOversightScreen()),
          '/admin-kyc-review': (_) => const MainShell(child: AdminKycReviewScreen()),
          '/admin-merchant-management': (_) => const MainShell(child: AdminMerchantManagementScreen()),
          '/admin-payout-approval': (_) => const MainShell(child: AdminPayoutApprovalScreen()),
          '/ai-insights': (_) => const MainShell(child: AIInsightsScreen()),
          '/a-p-i-keys': (_) => const MainShell(child: APIKeysScreen()),
          '/bill-payments': (_) => const MainShell(child: BillPaymentsScreen()),
          '/carbon-credits': (_) => const MainShell(child: CarbonCreditsScreen()),
          '/chargebacks': (_) => const MainShell(child: ChargebacksScreen()),
          '/aml-monitor': (_) => const MainShell(child: AmlMonitorScreen()),
          '/coupons': (_) => const MainShell(child: CouponsScreen()),
          '/crypto-wallet': (_) => const MainShell(child: CryptoWalletScreen()),
          '/digital-gold': (_) => const MainShell(child: DigitalGoldScreen()),
          '/escrow-accounts': (_) => const MainShell(child: EscrowAccountsScreen()),
          '/f-x-dashboard': (_) => const MainShell(child: FXDashboardScreen()),
          '/gift-cards': (_) => const MainShell(child: GiftCardsScreen()),
          '/insurance-policies': (_) => const MainShell(child: InsurancePoliciesScreen()),
          '/invoices': (_) => const MainShell(child: InvoicesScreen()),
          '/k-y-b-document-upload': (_) => const MainShell(child: KYBDocumentUploadScreen()),
          '/k-y-b-verifications': (_) => const MainShell(child: KYBVerificationsScreen()),
          '/loyalty-program': (_) => const MainShell(child: LoyaltyProgramScreen()),
          '/mobile-money-recon': (_) => const MainShell(child: MobileMoneyReconScreen()),
          '/nip-transfers': (_) => const MainShell(child: NIPTransfersScreen()),
          '/pos-terminals': (_) => const MainShell(child: POSTerminalsScreen()),
          '/q-r-payments': (_) => const MainShell(child: QRPaymentsScreen()),
          '/referrals': (_) => const MainShell(child: ReferralsScreen()),
          '/sip-investments': (_) => const MainShell(child: SipInvestmentsScreen()),
          '/subscriptions': (_) => const MainShell(child: SubscriptionsScreen()),
          '/team-roles': (_) => const MainShell(child: TeamRolesScreen()),
          '/transaction-receipts': (_) => const MainShell(child: TransactionReceiptsScreen()),
          '/ussd-services': (_) => const MainShell(child: USSDServicesScreen()),
          '/webhook-sim-v2': (_) => const MainShell(child: WebhookSimV2Screen()),
          '/aml-monitor': (_) => const MainShell(child: AmlMonitorScreen()),
          '/agent-banking': (_) => const MainShell(child: AgentBankingScreen()),
          '/billing-engine': (_) => const MainShell(child: BillingEngineScreen()),
          '/admin-kyc-review': (_) => const MainShell(child: AdminKycReviewScreen()),
          '/admin-fraud-oversight': (_) => const MainShell(child: AdminFraudOversightScreen()),
          '/admin-payout-approval': (_) => const MainShell(child: AdminPayoutApprovalScreen()),
          '/a-i-insights-v2': (_) => const MainShell(child: AIInsightsV2Screen()),
          '/a-i-model-admin': (_) => const MainShell(child: AIModelAdminScreen()),
          '/a-p-i-docs-portal': (_) => const MainShell(child: APIDocsPortalScreen()),
          '/active-sessions': (_) => const MainShell(child: ActiveSessionsScreen()),
          '/auth-events': (_) => const MainShell(child: AuthEventsScreen()),
          '/b-n-p-l-calculator': (_) => const MainShell(child: BNPLCalculatorScreen()),
          '/b-n-p-l-repayment-page': (_) => const MainShell(child: BNPLRepaymentPageScreen()),
          '/billing-config': (_) => const MainShell(child: BillingConfigScreen()),
          '/bnpl-repayment-tracker': (_) => const MainShell(child: BNPLRepaymentTrackerScreen()),
          '/bulk-collections': (_) => const MainShell(child: BulkCollectionsScreen()),
          '/c-i-p-s-gateway': (_) => const MainShell(child: CIPSGatewayScreen()),
          '/carbon-credits-ledger': (_) => const MainShell(child: CarbonCreditsLedgerScreen()),
          '/cashback-rewards': (_) => const MainShell(child: CashbackRewardsScreen()),
          '/claim-documents': (_) => const MainShell(child: ClaimDocumentsScreen()),
          '/compliance-k-y-c': (_) => const MainShell(child: ComplianceKYCScreen()),
          '/compliance-reports': (_) => const MainShell(child: ComplianceReportsScreen()),
          '/compliance-settings': (_) => const MainShell(child: ComplianceSettingsScreen()),
          '/consumer-analytics': (_) => const MainShell(child: ConsumerAnalyticsScreen()),
          '/consumer-disputes': (_) => const MainShell(child: ConsumerDisputesScreen()),
          '/consumer-insurance': (_) => const MainShell(child: ConsumerInsuranceScreen()),
          '/consumer-loans': (_) => const MainShell(child: ConsumerLoansScreen()),
          '/consumer-loyalty-app': (_) => const MainShell(child: ConsumerLoyaltyAppScreen()),
          '/corridor-live-stats': (_) => const MainShell(child: CorridorLiveStatsScreen()),
          '/corridor-management': (_) => const MainShell(child: CorridorManagementScreen()),
          '/coupon-management': (_) => const MainShell(child: CouponManagementScreen()),
          '/cross-border-rail-monitor': (_) => const MainShell(child: CrossBorderRailMonitorScreen()),
          '/data-export': (_) => const MainShell(child: DataExportScreen()),
          '/developer-portal': (_) => const MainShell(child: DeveloperPortalScreen()),
          '/developer-sandbox': (_) => const MainShell(child: DeveloperSandboxScreen()),
          '/dispute-escalation': (_) => const MainShell(child: DisputeEscalationScreen()),
          '/dispute-workflow': (_) => const MainShell(child: DisputeWorkflowScreen()),
          '/e-m-i-checkout': (_) => const MainShell(child: EMICheckoutScreen()),
          '/e-m-i-loans-page': (_) => const MainShell(child: EMILoansPageScreen()),
          '/e-m-i-management': (_) => const MainShell(child: EMIManagementScreen()),
          '/escrow-contracts': (_) => const MainShell(child: EscrowContractsScreen()),
          '/fraud-alert-comments': (_) => const MainShell(child: FraudAlertCommentsScreen()),
          '/fraud-alerts-dashboard': (_) => const MainShell(child: FraudAlertsDashboardScreen()),
          '/fx-hedging-workflow': (_) => const MainShell(child: FXHedgingWorkflowScreen()),
          '/geofence-alerts': (_) => const MainShell(child: GeofenceAlertsScreen()),
          '/go-live-checklist': (_) => const MainShell(child: GOLiveChecklistScreen()),
          '/gold-s-i-p': (_) => const MainShell(child: GoldSIPScreen()),
          '/insurance-hub': (_) => const MainShell(child: InsuranceHubScreen()),
          '/insurance-page': (_) => const MainShell(child: InsurancePageScreen()),
          '/international-remittance': (_) => const MainShell(child: InternationalRemittanceScreen()),
          '/inventory': (_) => const MainShell(child: InventoryScreen()),
          '/k-y-b-verification': (_) => const MainShell(child: KYBVerificationScreen()),
          '/keycloak-role-sync': (_) => const MainShell(child: KeycloakRoleSyncScreen()),
          '/kiosk-health': (_) => const MainShell(child: KioskHealthScreen()),
          '/kitchen-display': (_) => const MainShell(child: KitchenDisplayScreen()),
          '/lakehouse-a-i-dashboard': (_) => const MainShell(child: LakehouseAIDashboardScreen()),
          '/liveness-check': (_) => const MainShell(child: LivenessCheckScreen()),
          '/loan-repayments': (_) => const MainShell(child: LoanRepaymentsScreen()),
          '/loyalty-auto-promotion': (_) => const MainShell(child: LoyaltyAutoPromotionScreen()),
          '/loyalty-dashboard': (_) => const MainShell(child: LoyaltyDashboardScreen()),
          '/loyalty-ledger': (_) => const MainShell(child: LoyaltyLedgerScreen()),
          '/market-data-dashboard': (_) => const MainShell(child: MarketDataDashboardScreen()),
          '/menu-management': (_) => const MainShell(child: MenuManagementScreen()),
          '/merchant-analytics-dashboard': (_) => const MainShell(child: MerchantAnalyticsDashboardScreen()),
          '/merchant-lending': (_) => const MainShell(child: MerchantLendingScreen()),
          '/merchant-notification-preferences': (_) => const MainShell(child: MerchantNotificationPreferencesScreen()),
          '/microservice-health': (_) => const MainShell(child: MicroserviceHealthScreen()),
          '/middleware-dashboard': (_) => const MainShell(child: MiddlewareDashboardScreen()),
          '/mobile-p-o-s': (_) => const MainShell(child: MobilePOSScreen()),
          '/mojaloop-dashboard': (_) => const MainShell(child: MojaloopDashboardScreen()),
          '/mutual-funds': (_) => const MainShell(child: MutualFundsScreen()),
          '/n-i-p-banks': (_) => const MainShell(child: NIPBanksScreen()),
          '/nodal-accounts': (_) => const MainShell(child: NodalAccountsScreen()),
          '/notifications-center': (_) => const MainShell(child: NotificationsCenterScreen()),
          '/ollama-chat': (_) => const MainShell(child: OllamaChatScreen()),
          '/p-i-x-gateway': (_) => const MainShell(child: PIXGatewayScreen()),
          '/p-o-s-reconciliation': (_) => const MainShell(child: POSReconciliationScreen()),
          '/p-o-s-terminals': (_) => const MainShell(child: POSTerminalsScreen()),
          '/p-o-s-transactions': (_) => const MainShell(child: POSTransactionsScreen()),
          '/p-t-s-p-settlement': (_) => const MainShell(child: PTSPSettlementScreen()),
          '/partner-admin-dashboard': (_) => const MainShell(child: PartnerAdminDashboardScreen()),
          '/partner-onboard': (_) => const MainShell(child: PartnerOnboardScreen()),
          '/payout-batching': (_) => const MainShell(child: PayoutBatchingScreen()),
          '/pension-n-p-s': (_) => const MainShell(child: PensionNPSScreen()),
          '/portal-health-dashboard': (_) => const MainShell(child: PortalHealthDashboardScreen()),
          '/portfolio-rebalancing': (_) => const MainShell(child: PortfolioRebalancingScreen()),
          '/pricing-page': (_) => const MainShell(child: PricingPageScreen()),
          '/privacy-payments': (_) => const MainShell(child: PrivacyPaymentsScreen()),
          '/ptsp-batches': (_) => const MainShell(child: PTSPBatchesScreen()),
          '/purchase-orders': (_) => const MainShell(child: PurchaseOrdersScreen()),
          '/q-r-generator': (_) => const MainShell(child: QRGeneratorScreen()),
          '/quick-pay': (_) => const MainShell(child: QuickPayScreen()),
          '/rate-limit-dashboard': (_) => const MainShell(child: RateLimitDashboardScreen()),
          '/reconciliation-alerts': (_) => const MainShell(child: ReconciliationAlertsScreen()),
          '/red-envelopes': (_) => const MainShell(child: RedEnvelopesScreen()),
          '/referral-program': (_) => const MainShell(child: ReferralProgramScreen()),
          '/refund-workflow': (_) => const MainShell(child: RefundWorkflowScreen()),
          '/remittance-tracker': (_) => const MainShell(child: RemittanceTrackerScreen()),
          '/reports-center': (_) => const MainShell(child: ReportsCenterScreen()),
          '/restaurant-floor-plan': (_) => const MainShell(child: RestaurantFloorPlanScreen()),
          '/restaurant-loyalty': (_) => const MainShell(child: RestaurantLoyaltyScreen()),
          '/restaurant-menu': (_) => const MainShell(child: RestaurantMenuScreen()),
          '/restaurant-online-ordering': (_) => const MainShell(child: RestaurantOnlineOrderingScreen()),
          '/restaurant-orders': (_) => const MainShell(child: RestaurantOrdersScreen()),
          '/s-d-k-tokens': (_) => const MainShell(child: SDKTokensScreen()),
          '/salary-accounts': (_) => const MainShell(child: SalaryAccountsScreen()),
          '/saved-beneficiaries': (_) => const MainShell(child: SavedBeneficiariesScreen()),
          '/settings-payments': (_) => const MainShell(child: SettingsPaymentsScreen()),
          '/settlement-forecast': (_) => const MainShell(child: SettlementForecastScreen()),
          '/settlement-s-l-a': (_) => const MainShell(child: SettlementSLAScreen()),
          '/sla-alert-dashboard': (_) => const MainShell(child: SLAAlertDashboardScreen()),
          '/sla-breaches': (_) => const MainShell(child: SLABreachesScreen()),
          '/smart-retail-p-o-s': (_) => const MainShell(child: SmartRetailPOSScreen()),
          '/split-payments': (_) => const MainShell(child: SplitPaymentsScreen()),
          '/stripe-subscriptions': (_) => const MainShell(child: StripeSubscriptionsScreen()),
          '/subscription-billing-v2': (_) => const MainShell(child: SubscriptionBillingV2Screen()),
          '/subscription-management': (_) => const MainShell(child: SubscriptionManagementScreen()),
          '/subscriptions-page': (_) => const MainShell(child: SubscriptionsPageScreen()),
          '/super-agent-management': (_) => const MainShell(child: SuperAgentManagementScreen()),
          '/support-admin': (_) => const MainShell(child: SupportAdminScreen()),
          '/tax-engine': (_) => const MainShell(child: TaxEngineScreen()),
          '/tenant-admin-dashboard': (_) => const MainShell(child: TenantAdminDashboardScreen()),
          '/tenant-api-keys': (_) => const MainShell(child: TenantAPIKeysScreen()),
          '/tenant-billing-cron': (_) => const MainShell(child: TenantBillingCronScreen()),
          '/tenant-billing-dashboard': (_) => const MainShell(child: TenantBillingDashboardScreen()),
          '/tenant-branding-admin': (_) => const MainShell(child: TenantBrandingAdminScreen()),
          '/tenant-sso-config': (_) => const MainShell(child: TenantSsoConfigScreen()),
          '/tenant-stripe-billing': (_) => const MainShell(child: TenantStripeBillingScreen()),
          '/terminal-map': (_) => const MainShell(child: TerminalMapScreen()),
          '/transaction-receipts-v2': (_) => const MainShell(child: TransactionReceiptsV2Screen()),
          '/u-p-i-gateway': (_) => const MainShell(child: UPIGatewayScreen()),
          '/u-s-d-c-payouts': (_) => const MainShell(child: USDCPayoutsScreen()),
          '/u-s-s-d-sessions': (_) => const MainShell(child: USSDSessionsScreen()),
          '/ussd-menu-builder': (_) => const MainShell(child: USSDMenuBuilderScreen()),
          '/vendors': (_) => const MainShell(child: VendorsScreen()),
          '/voice-payments': (_) => const MainShell(child: VoicePaymentsScreen()),
          '/w-a-f-alert-dashboard': (_) => const MainShell(child: WAFAlertDashboardScreen()),
          '/wealth-management': (_) => const MainShell(child: WealthManagementScreen()),
          '/webhook-deliveries': (_) => const MainShell(child: WebhookDeliveriesScreen()),
          '/webhook-events-page': (_) => const MainShell(child: WebhookEventsPageScreen()),
          '/webhook-live-stream': (_) => const MainShell(child: WebhookLiveStreamScreen()),
          '/webhook-simulator-v2': (_) => const MainShell(child: WebhookSimulatorV2Screen()),
          '/white-label-preview': (_) => const MainShell(child: WhiteLabelPreviewScreen()),
          '/white-label-s-d-k': (_) => const MainShell(child: WhiteLabelSDKScreen()),
          '/workflow-observability': (_) => const MainShell(child: WorkflowObservabilityScreen()),
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
