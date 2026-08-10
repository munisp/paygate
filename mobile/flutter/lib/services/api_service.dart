import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const String _kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.paygate.africa/api',
);

const _storage = FlutterSecureStorage();

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: _kBaseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  ));

  // Auth interceptor
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await _storage.read(key: 'session_token');
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      return handler.next(options);
    },
    onError: (error, handler) async {
      if (error.response?.statusCode == 401) {
        await _storage.delete(key: 'session_token');
        // Redirect to login handled by router
      }
      return handler.next(error);
    },
  ));

  // Logging in debug mode
  dio.interceptors.add(LogInterceptor(
    requestBody: false,
    responseBody: false,
    logPrint: (o) => debugPrint('[API] $o'),
  ));

  return dio;
});

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService(ref.watch(dioProvider));
});

class ApiService {
  final Dio _dio;
  ApiService(this._dio);

  // ─── tRPC helper ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> trpcQuery(String procedure, [Map<String, dynamic>? input]) async {
    final inputJson = input != null ? Uri.encodeComponent('{"json":${_encodeJson(input)}}') : Uri.encodeComponent('{"json":null}');
    final response = await _dio.get('/trpc/$procedure?input=$inputJson');
    return _unwrapTrpc(response.data);
  }

  Future<Map<String, dynamic>> trpcMutation(String procedure, Map<String, dynamic> input) async {
    final response = await _dio.post('/trpc/$procedure', data: {'json': input});
    return _unwrapTrpc(response.data);
  }

  Map<String, dynamic> _unwrapTrpc(dynamic data) {
    if (data is Map && data.containsKey('result')) {
      return (data['result'] as Map<String, dynamic>?) ?? {};
    }
    return data is Map<String, dynamic> ? data : {};
  }

  String _encodeJson(Map<String, dynamic> input) {
    return input.entries.map((e) {
      final v = e.value;
      if (v is String) return '"${e.key}":"$v"';
      if (v is bool || v is num) return '"${e.key}":$v';
      if (v == null) return '"${e.key}":null';
      return '"${e.key}":"$v"';
    }).join(',').let((s) => '{$s}');
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getMe() => trpcQuery('auth.me');

  Future<void> logout() async {
    await trpcMutation('auth.logout', {});
    await _storage.delete(key: 'session_token');
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getDashboardStats() =>
      trpcQuery('dashboard.getStats');

  Future<Map<String, dynamic>> getRevenueChart(String period) =>
      trpcQuery('dashboard.getRevenueChart', {'period': period});

  Future<Map<String, dynamic>> getRecentTransactions() =>
      trpcQuery('dashboard.getRecentTransactions', {'limit': 5});

  // ─── Transactions ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listTransactions({
    int page = 1,
    int limit = 20,
    String? status,
    String? search,
    String? startDate,
    String? endDate,
  }) => trpcQuery('transactions.list', {
    'page': page,
    'limit': limit,
    if (status != null) 'status': status,
    if (search != null) 'search': search,
    if (startDate != null) 'startDate': startDate,
    if (endDate != null) 'endDate': endDate,
  });

  Future<Map<String, dynamic>> getTransaction(String id) =>
      trpcQuery('transactions.getById', {'id': int.parse(id)});

  Future<Map<String, dynamic>> refundTransaction(int transactionId) =>
      trpcMutation('transactions.refund', {'transactionId': transactionId});

  Future<Map<String, dynamic>> exportTransactions(Map<String, dynamic> filters) =>
      trpcMutation('transactions.export', filters);

  // ─── Payouts ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listPayouts({int page = 1, int limit = 20, String? status}) =>
      trpcQuery('payouts.list', {'page': page, 'limit': limit, if (status != null) 'status': status});

  Future<Map<String, dynamic>> createPayout(Map<String, dynamic> data) =>
      trpcMutation('payouts.create', data);

  Future<Map<String, dynamic>> approvePayout(int payoutId) =>
      trpcMutation('payouts.approve', {'payoutId': payoutId});

  Future<Map<String, dynamic>> rejectPayout(int payoutId, String reason) =>
      trpcMutation('payouts.reject', {'payoutId': payoutId, 'reason': reason});

  // ─── Analytics ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getAnalytics(String period) =>
      trpcQuery('analytics.getSummary', {'period': period});

  Future<Map<String, dynamic>> getChannelBreakdown(String period) =>
      trpcQuery('analytics.getChannelBreakdown', {'period': period});

  Future<Map<String, dynamic>> getTopCustomers({int limit = 10}) =>
      trpcQuery('analytics.getTopCustomers', {'limit': limit});

  // ─── Virtual Cards ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listVirtualCards({int page = 1}) =>
      trpcQuery('virtualCards.list', {'page': page});

  Future<Map<String, dynamic>> createVirtualCard(Map<String, dynamic> data) =>
      trpcMutation('virtualCards.create', data);

  Future<Map<String, dynamic>> freezeCard(int cardId) =>
      trpcMutation('virtualCards.freeze', {'cardId': cardId});

  Future<Map<String, dynamic>> unfreezeCard(int cardId) =>
      trpcMutation('virtualCards.unfreeze', {'cardId': cardId});

  Future<Map<String, dynamic>> terminateCard(int cardId) =>
      trpcMutation('virtualCards.terminate', {'cardId': cardId});

  // ─── Disputes ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listDisputes({int page = 1, String? status}) =>
      trpcQuery('disputes.list', {'page': page, 'limit': 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> respondToDispute(int disputeId, String response) =>
      trpcMutation('disputes.respond', {'disputeId': disputeId, 'response': response});

  Future<Map<String, dynamic>> escalateDispute(int disputeId) =>
      trpcMutation('disputes.escalate', {'disputeId': disputeId});

  // ─── Settings ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getMerchantProfile() =>
      trpcQuery('settings.getMerchantProfile');

  Future<Map<String, dynamic>> updateMerchantProfile(Map<String, dynamic> data) =>
      trpcMutation('settings.updateMerchantProfile', data);

  Future<Map<String, dynamic>> getApiKeys() =>
      trpcQuery('apiKeys.list');

  Future<Map<String, dynamic>> createApiKey(String name) =>
      trpcMutation('apiKeys.create', {'name': name});

  Future<Map<String, dynamic>> revokeApiKey(int keyId) =>
      trpcMutation('apiKeys.revoke', {'keyId': keyId});

  Future<Map<String, dynamic>> listWebhooks() =>
      trpcQuery('webhooks.list');

  Future<Map<String, dynamic>> createWebhook(Map<String, dynamic> data) =>
      trpcMutation('webhooks.create', data);

  Future<Map<String, dynamic>> deleteWebhook(int webhookId) =>
      trpcMutation('webhooks.delete', {'webhookId': webhookId});

  //  // ─── BNPL ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listBnplPlans({int page = 1, String? status}) =>
      trpcQuery('bnpl.listPlans', {'page': page, 'limit': 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> getBnplPlan(int planId) =>
      trpcQuery('bnpl.getPlan', {'planId': planId});

  Future<Map<String, dynamic>> createBnplPlan(Map<String, dynamic> data) =>
      trpcMutation('bnpl.createPlan', data);

  Future<Map<String, dynamic>> recordBnplRepayment(int planId, double amount) =>
      trpcMutation('bnpl.recordRepayment', {'planId': planId, 'amount': amount});

  // ─── FX & Cross-Border ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getFxRates({String? baseCurrency}) =>
      trpcQuery('fx.getRates', {if (baseCurrency != null) 'baseCurrency': baseCurrency});

  Future<Map<String, dynamic>> convertCurrency(String from, String to, double amount) =>
      trpcMutation('fx.convert', {'from': from, 'to': to, 'amount': amount});

  Future<Map<String, dynamic>> listCrossBorderTransactions({int page = 1, String? status}) =>
      trpcQuery('crossBorder.list', {'page': page, 'limit': 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> initiateCrossBorderTransfer(Map<String, dynamic> data) =>
      trpcMutation('crossBorder.initiate', data);

  // ─── Fraud Risk ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getFraudAlerts({int page = 1, String? severity}) =>
      trpcQuery('fraud.getAlerts', {'page': page, 'limit': 20, if (severity != null) 'severity': severity});

  Future<Map<String, dynamic>> getFraudStats() =>
      trpcQuery('fraud.getStats');

  Future<Map<String, dynamic>> dismissFraudAlert(int alertId) =>
      trpcMutation('fraud.dismissAlert', {'alertId': alertId});

  Future<Map<String, dynamic>> blockFraudEntity(String entityType, String entityId) =>
      trpcMutation('fraud.blockEntity', {'entityType': entityType, 'entityId': entityId});

  // ─── Payment Links ────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listPaymentLinks({int page = 1, String? status}) =>
      trpcQuery('paymentLinks.list', {'page': page, 'limit': 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> createPaymentLink(Map<String, dynamic> data) =>
      trpcMutation('paymentLinks.create', data);

  Future<Map<String, dynamic>> deactivatePaymentLink(int linkId) =>
      trpcMutation('paymentLinks.deactivate', {'linkId': linkId});

  Future<Map<String, dynamic>> getPaymentLinkStats(int linkId) =>
      trpcQuery('paymentLinks.getStats', {'linkId': linkId});

  // ─── Notifications ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listNotifications({int page = 1, bool? unreadOnly}) =>
      trpcQuery('notifications.list', {'page': page, 'limit': 20, if (unreadOnly != null) 'unreadOnly': unreadOnly});

  Future<Map<String, dynamic>> markNotificationRead(int notificationId) =>
      trpcMutation('notifications.markRead', {'notificationId': notificationId});

  Future<Map<String, dynamic>> markAllNotificationsRead() =>
      trpcMutation('notifications.markAllRead', {});

  Future<Map<String, dynamic>> getNotificationPreferences() =>
      trpcQuery('notifications.getPreferences');

  Future<Map<String, dynamic>> updateNotificationPreferences(Map<String, dynamic> prefs) =>
      trpcMutation('notifications.updatePreferences', prefs);

  // ─── Push Notifications ──────────────────────────────────────────────
  Future<Map<String, dynamic>> registerPushToken(String token, String platform) =>
      trpcMutation('pushTokens.register', {'token': token, 'platform': platform});

  Future<Map<String, dynamic>> deregisterPushToken(String token) =>
      trpcMutation('pushTokens.deregister', {'token': token});

  // ─── Webhook Deliveries ──────────────────────────────────────────────
  Future<Map<String, dynamic>> listWebhookDeliveries({int page = 1}) =>
      trpcQuery('webhookDeliveries.list', {'page': page, 'limit': 20});

  Future<Map<String, dynamic>> updateWebhook(String webhookId, Map<String, dynamic> data) =>
      trpcMutation('webhooks.update', {'webhookId': webhookId, ...data});

  Future<Map<String, dynamic>> retryWebhookDelivery(String deliveryId) =>
      trpcMutation('webhookDeliveries.retry', {'deliveryId': deliveryId});

  // ─── Audit Log ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> searchAuditLogs({int page = 1, String? actor, String? action, String? resource}) =>
      trpcQuery('auditLog.search', {'page': page, 'limit': 20, if (actor != null) 'actor': actor, if (action != null) 'action': action, if (resource != null) 'resource': resource});

  // ─── Billing Analytics ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getBillingInvoices({int page = 1}) =>
      trpcQuery('billing.invoices', {'page': page, 'limit': 20});

  // ─── Chargeback Cases ──────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listChargebackCases({int page = 1, String? status}) =>
      trpcQuery('chargebacks.listCases', {'page': page, 'limit': 20, if (status != null) 'status': status});
  Future<Map<String, dynamic>> submitChargebackEvidence(String caseId, Map<String, dynamic> evidence) =>
      trpcMutation('chargebacks.submitEvidence', {'caseId': caseId, ...evidence});

  // ─── Fee Schedules ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listFeeSchedules({int page = 1}) =>
      trpcQuery('feeSchedules.list', {'page': page, 'limit': 20});
  Future<Map<String, dynamic>> createFeeSchedule(Map<String, dynamic> data) =>
      trpcMutation('feeSchedules.create', data);
  Future<Map<String, dynamic>> deleteFeeSchedule(String scheduleId) =>
      trpcMutation('feeSchedules.delete', {'scheduleId': scheduleId});

  // ─── Fraud Rules ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listFraudRules({int page = 1, bool? isActive}) =>
      trpcQuery('fraudRules.list', {'page': page, 'limit': 20, if (isActive != null) 'isActive': isActive});
  Future<Map<String, dynamic>> createFraudRule(Map<String, dynamic> data) =>
      trpcMutation('fraudRules.create', data);
  Future<Map<String, dynamic>> toggleFraudRule(String ruleId, bool isActive) =>
      trpcMutation('fraudRules.toggle', {'ruleId': ruleId, 'isActive': isActive});

  // ─── Invoice Financing ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listInvoiceFinancing({int page = 1, String? status}) =>
      trpcQuery('invoiceFinancing.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  Future<Map<String, dynamic>> applyForInvoiceFinancing(Map<String, dynamic> data) =>
      trpcMutation('invoiceFinancing.apply', data);

  // ─── KYB Verifications ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listKybVerifications({int page = 1, String? status}) =>
      trpcQuery('kyb.listVerifications', {'page': page, 'limit': 20, if (status != null) 'status': status});
  Future<Map<String, dynamic>> submitKybDocument(Map<String, dynamic> data) =>
      trpcMutation('kyb.submitDocument', data);
  Future<Map<String, dynamic>> getKybStatus() =>
      trpcQuery('kyb.getStatus');

  // ─── Loyalty V3 ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listLoyaltyV3Campaigns({int page = 1}) =>
      trpcQuery('loyaltyV3.listCampaigns', {'page': page, 'limit': 20});
  Future<Map<String, dynamic>> createLoyaltyV3Campaign(Map<String, dynamic> data) =>
      trpcMutation('loyaltyV3.createCampaign', data);
  Future<Map<String, dynamic>> getLoyaltyV3Leaderboard({String period = '30d'}) =>
      trpcQuery('loyaltyV3.getLeaderboard', {'period': period});

  // ─── Tenant Provisioning ───────────────────────────────────────────────────
  Future<Map<String, dynamic>> listTenants({int page = 1, String? status}) =>
      trpcQuery('tenantAdmin.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  Future<Map<String, dynamic>> provisionTenant(Map<String, dynamic> data) =>
      trpcMutation('tenantAdmin.provision', data);
  Future<Map<String, dynamic>> suspendTenant(String tenantId, String reason) =>
      trpcMutation('tenantAdmin.suspend', {'tenantId': tenantId, 'reason': reason});

  // ─── Virtual Cards (Full) ──────────────────────────────────────────────────
  Future<Map<String, dynamic>> getVirtualCardTransactions(String cardId, {int page = 1}) =>
      trpcQuery('virtualCards.getTransactions', {'cardId': cardId, 'page': page, 'limit': 20});
  Future<Map<String, dynamic>> setVirtualCardSpendLimit(String cardId, int limitKobo) =>
      trpcMutation('virtualCards.setSpendLimit', {'cardId': cardId, 'limitKobo': limitKobo});
  Future<Map<String, dynamic>> getVirtualCardStats() =>
      trpcQuery('virtualCards.getStats');

  // ─── POS Products ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listPosProducts({int page = 1, String? category}) =>
      trpcQuery('pos.products.list', {'page': page, 'limit': 50, if (category != null) 'category': category});
  Future<Map<String, dynamic>> createPosProduct(Map<String, dynamic> data) =>
      trpcMutation('pos.products.create', data);
  Future<Map<String, dynamic>> updatePosProduct(String productId, Map<String, dynamic> data) =>
      trpcMutation('pos.products.update', {'id': productId, ...data});
  Future<Map<String, dynamic>> deletePosProduct(String productId) =>
      trpcMutation('pos.products.delete', {'id': productId});
}

extension _Let<T> on T {
  R let<R>(R Function(T) block) => block(this);
}

void debugPrint(String message) {
  // ignore: avoid_print
  print(message);
}
