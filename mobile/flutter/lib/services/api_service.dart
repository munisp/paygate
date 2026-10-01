import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
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
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
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

  // Minimal in-memory GET cache (TTL 30s, keyed by uri + auth scope).
  // No dio_cache_interceptor / dio_smart_retry in pubspec, so implemented here.
  dio.interceptors.add(_InMemoryGetCacheInterceptor(ttl: const Duration(seconds: 30)));

  // Logging in debug mode only — never log request traffic in release builds.
  if (kDebugMode) {
    dio.interceptors.add(LogInterceptor(
      requestBody: false,
      responseBody: false,
      logPrint: (o) => debugPrint('[API] $o'),
    ));
  }

  return dio;
});

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService(ref.watch(dioProvider));
});

/// Decodes a JSON body, offloading to a background isolate via [compute]
/// when the payload exceeds 50 KB so the main isolate stays responsive.
Future<dynamic> decodeJsonBody(String body) {
  if (body.length > 50 * 1024) {
    return compute(_jsonDecodeSync, body);
  }
  return Future.value(jsonDecode(body));
}

dynamic _jsonDecodeSync(String body) => jsonDecode(body);

class ApiService {
  final Dio _dio;
  ApiService(this._dio);

  // ─── tRPC helper ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> trpcQuery(String procedure, [Map<String, dynamic>? input]) async {
    final inputJson = Uri.encodeComponent(jsonEncode(_superjsonWrap(input)));
    final response = await _dio.get('/trpc/$procedure?input=$inputJson');
    return _unwrapTrpc(response.data);
  }

  Future<Map<String, dynamic>> trpcMutation(String procedure, Map<String, dynamic> input) async {
    final response = await _dio.post('/trpc/$procedure', data: _superjsonWrap(input));
    return _unwrapTrpc(response.data);
  }

  /// The server uses the superjson transformer. Plain `{'json': input}` works
  /// for JSON-native values, but `z.date()` inputs require superjson `meta`
  /// entries. Top-level [DateTime] values are encoded accordingly.
  static Map<String, dynamic> _superjsonWrap(Map<String, dynamic>? input) {
    if (input == null) return {'json': null};
    final json = <String, dynamic>{};
    final metaValues = <String, List<String>>{};
    input.forEach((key, value) {
      if (value is DateTime) {
        json[key] = value.toUtc().toIso8601String();
        metaValues[key] = ['Date'];
      } else {
        json[key] = value;
      }
    });
    if (metaValues.isEmpty) return {'json': json};
    return {'json': json, 'meta': {'values': metaValues}};
  }

  /// Resolves a period token ('7d'/'30d'/'90d', default 30d) to a from/to range.
  static Map<String, DateTime> _periodRange(String period) {
    final days = int.tryParse(period.replaceAll('d', '')) ?? 30;
    final to = DateTime.now().toUtc();
    return {'from': to.subtract(Duration(days: days)), 'to': to};
  }

  Map<String, dynamic> _unwrapTrpc(dynamic data) {
    if (data is Map && data.containsKey('result')) {
      return (data['result'] as Map<String, dynamic>?) ?? {};
    }
    return data is Map<String, dynamic> ? data : {};
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getMe() => trpcQuery('auth.me');

  Future<void> logout() async {
    await trpcMutation('auth.logout', {});
    await _storage.delete(key: 'session_token');
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getDashboardStats() =>
      trpcQuery('dashboard.overview');

  // Revenue chart data comes from analytics.timeSeries (from/to are z.date()).
  Future<Map<String, dynamic>> getRevenueChart(String period) =>
      trpcQuery('analytics.timeSeries', _periodRange(period));

  Future<Map<String, dynamic>> getRecentTransactions() =>
      trpcQuery('transactions.list', {'limit': 5});

  // ─── Transactions ──────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listTransactions({
    int page = 1,
    int limit = 20,
    String? status,
    String? search,
    String? startDate,
    String? endDate,
  }) => trpcQuery('transactions.list', {
    // Server paginates with limit/offset (no page param).
    'limit': limit,
    'offset': (page - 1) * limit,
    if (status != null) 'status': status,
    if (search != null) 'search': search,
    if (startDate != null) 'from': DateTime.parse(startDate).toUtc(),
    if (endDate != null) 'to': DateTime.parse(endDate).toUtc(),
  });

  Future<Map<String, dynamic>> getTransaction(String id) =>
      trpcQuery('transactions.get', {'id': id});

  Future<Map<String, dynamic>> refundTransaction(int transactionId) =>
      trpcMutation('transactions.refund', {'id': transactionId.toString()});

  // CSV export lives on the export router and is a query.
  Future<Map<String, dynamic>> exportTransactions(Map<String, dynamic> filters) =>
      trpcQuery('export.transactions', filters);

  // ─── Payouts ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listPayouts({int page = 1, int limit = 20, String? status}) =>
      trpcQuery('payouts.list', {'limit': limit, 'offset': (page - 1) * limit, if (status != null) 'status': status});

  Future<Map<String, dynamic>> createPayout(Map<String, dynamic> data) =>
      trpcMutation('payouts.create', data);

  Future<Map<String, dynamic>> approvePayout(int payoutId) =>
      trpcMutation('payouts.approve', {'id': payoutId.toString()});

  Future<Map<String, dynamic>> rejectPayout(int payoutId, String reason) =>
      trpcMutation('payouts.reject', {'id': payoutId.toString(), 'reason': reason});

  // ─── Analytics ─────────────────────────────────────────────────────────────
  // analytics.overview / channelBreakdown / merchantAnalytics.topCustomers all
  // take {from, to} z.date() inputs; derived from the period token.
  Future<Map<String, dynamic>> getAnalytics(String period) =>
      trpcQuery('analytics.overview', _periodRange(period));

  Future<Map<String, dynamic>> getChannelBreakdown(String period) =>
      trpcQuery('analytics.channelBreakdown', _periodRange(period));

  Future<Map<String, dynamic>> getTopCustomers({int limit = 10}) =>
      trpcQuery('merchantAnalytics.topCustomers', {..._periodRange('30d'), 'limit': limit});

  // ─── Virtual Cards ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listVirtualCards({int page = 1}) =>
      trpcQuery('virtualCards.list', {'page': page});

  Future<Map<String, dynamic>> createVirtualCard(Map<String, dynamic> data) =>
      trpcMutation('virtualCards.create', data);

  // Server exposes a single idempotent toggle (freeze <-> active).
  Future<Map<String, dynamic>> freezeCard(int cardId) =>
      trpcMutation('virtualCards.toggleFreeze', {'id': cardId.toString()});

  Future<Map<String, dynamic>> unfreezeCard(int cardId) =>
      trpcMutation('virtualCards.toggleFreeze', {'id': cardId.toString()});

  // Termination only exists on the middleware-backed virtualCardsMw router.
  Future<Map<String, dynamic>> terminateCard(int cardId) =>
      trpcMutation('virtualCardsMw.terminate', {'cardId': cardId.toString()});

  // ─── Disputes ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listDisputes({int page = 1, String? status}) =>
      trpcQuery('disputes.list', {'limit': 20, 'offset': (page - 1) * 20});

  // disputes.respond takes {id, merchantResponse (min 10 chars), evidence?}.
  Future<Map<String, dynamic>> respondToDispute(int disputeId, String response) =>
      trpcMutation('disputes.respond', {'id': disputeId.toString(), 'merchantResponse': response});

  Future<Map<String, dynamic>> escalateDispute(int disputeId) =>
      trpcMutation('disputes.escalate', {'id': disputeId.toString()});

  // ─── Settings ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getMerchantProfile() =>
      trpcQuery('settings.get');

  // settings.updateMerchant accepts {businessName?, email?, phone?, webhookUrl?}.
  Future<Map<String, dynamic>> updateMerchantProfile(Map<String, dynamic> data) =>
      trpcMutation('settings.updateMerchant', data);

  Future<Map<String, dynamic>> getApiKeys() =>
      trpcQuery('apiKeys.list');

  Future<Map<String, dynamic>> createApiKey(String name) =>
      trpcMutation('apiKeys.create', {'name': name});

  Future<Map<String, dynamic>> revokeApiKey(int keyId) =>
      trpcMutation('apiKeys.revoke', {'id': keyId.toString()});

  Future<Map<String, dynamic>> listWebhooks() =>
      trpcQuery('webhooks.list');

  // Webhook endpoint CRUD lives on crud.webhookEndpoints
  // (create requires {url, events, secret}).
  Future<Map<String, dynamic>> createWebhook(Map<String, dynamic> data) =>
      trpcMutation('crud.webhookEndpoints.create', data);

  Future<Map<String, dynamic>> deleteWebhook(int webhookId) =>
      trpcMutation('crud.webhookEndpoints.delete', {'id': webhookId.toString()});

  //  // ─── BNPL ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listBnplPlans({int page = 1, String? status}) =>
      trpcQuery('bnpl.listPlans', {'page': page, 'limit': 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> getBnplPlan(int planId) =>
      trpcQuery('bnpl.getLoan', {'loanId': planId.toString()});

  Future<Map<String, dynamic>> createBnplPlan(Map<String, dynamic> data) =>
      trpcMutation('bnpl.createPlan', data);

  Future<Map<String, dynamic>> recordBnplRepayment(int planId, double amount) =>
      trpcMutation('bnpl.recordRepayment', {'loanId': planId.toString(), 'amount': amount});

  // ─── FX & Cross-Border ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getFxRates({String? baseCurrency}) =>
      trpcQuery('fx.getRates', {if (baseCurrency != null) 'base': baseCurrency});

  Future<Map<String, dynamic>> convertCurrency(String from, String to, double amount) =>
      trpcMutation('fx.convertCurrency', {'fromCurrency': from, 'toCurrency': to, 'amount': amount.round()});

  Future<Map<String, dynamic>> listCrossBorderTransactions({int page = 1, String? status}) =>
      trpcQuery('crossBorder.list', {'limit': 20, 'offset': (page - 1) * 20, if (status != null) 'status': status});

  Future<Map<String, dynamic>> initiateCrossBorderTransfer(Map<String, dynamic> data) =>
      trpcMutation('crossBorder.initiate', data);

  // ─── Fraud Risk ────────────────────────────────────────────────────────────
  // fraudRisk.list accepts {status?, limit, offset} — no severity filter exists.
  Future<Map<String, dynamic>> getFraudAlerts({int page = 1, String? severity}) =>
      trpcQuery('fraudRisk.list', {'limit': 20, 'offset': (page - 1) * 20});

  Future<Map<String, dynamic>> getFraudStats() =>
      trpcQuery('fraudRisk.stats');

  Future<Map<String, dynamic>> dismissFraudAlert(int alertId) =>
      trpcMutation('fraudRisk.updateAlert', {'id': alertId.toString(), 'status': 'false_positive'});

  // BLOCKED: no server procedure blocks a fraud entity (fraudRisk only has
  // list/stats/createAlert/getAlerts/updateAlert/acknowledge/bulkUpdateAlerts/
  // addComment/getComments/seedDemoAlerts). Left untouched per fail-loud rule.
  Future<Map<String, dynamic>> blockFraudEntity(String entityType, String entityId) =>
      trpcMutation('fraud.blockEntity', {'entityType': entityType, 'entityId': entityId});

  // ─── Payment Links ────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listPaymentLinks({int page = 1, String? status}) =>
      trpcQuery('paymentLinks.list', {'limit': 20, 'offset': (page - 1) * 20});

  Future<Map<String, dynamic>> createPaymentLink(Map<String, dynamic> data) =>
      trpcMutation('paymentLinks.create', data);

  // Server has no deactivate; paymentLinks.toggle flips isActive.
  Future<Map<String, dynamic>> deactivatePaymentLink(int linkId) =>
      trpcMutation('paymentLinks.toggle', {'id': linkId.toString()});

  Future<Map<String, dynamic>> getPaymentLinkStats(int linkId) =>
      trpcQuery('paymentLinks.analytics', {'id': linkId.toString()});

  // ─── Notifications ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listNotifications({int page = 1, bool? unreadOnly}) =>
      trpcQuery('notifications.list', {'page': page, 'limit': 20, if (unreadOnly != null) 'unreadOnly': unreadOnly});

  Future<Map<String, dynamic>> markNotificationRead(int notificationId) =>
      trpcMutation('notifications.markRead', {'id': notificationId});

  Future<Map<String, dynamic>> markAllNotificationsRead() =>
      trpcMutation('notifications.markAllRead', {});

  Future<Map<String, dynamic>> getNotificationPreferences() =>
      trpcQuery('notificationPreferences.get');

  Future<Map<String, dynamic>> updateNotificationPreferences(Map<String, dynamic> prefs) =>
      trpcMutation('notificationPreferences.update', prefs);

  // ─── Push Notifications ──────────────────────────────────────────────
  Future<Map<String, dynamic>> registerPushToken(String token, String platform) =>
      trpcMutation('pushTokens.register', {'token': token, 'platform': platform});

  Future<Map<String, dynamic>> deregisterPushToken(String token) =>
      trpcMutation('pushTokens.deregister', {'token': token});

  // ─── Webhook Deliveries ──────────────────────────────────────────────
  Future<Map<String, dynamic>> listWebhookDeliveries({int page = 1}) =>
      trpcQuery('webhookDeliveries.list', {'page': page, 'limit': 20});

  // crud.webhookEndpoints.update accepts {id, url?, events?, isActive?}.
  Future<Map<String, dynamic>> updateWebhook(String webhookId, Map<String, dynamic> data) =>
      trpcMutation('crud.webhookEndpoints.update', {'id': webhookId, ...data});

  Future<Map<String, dynamic>> retryWebhookDelivery(String deliveryId) =>
      trpcMutation('webhookDeliveries.retry', {'deliveryId': deliveryId});

  // ─── Audit Log ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> searchAuditLogs({int page = 1, String? actor, String? action, String? resource}) =>
      trpcQuery('auditLog.search', {'page': page, 'limit': 20, if (actor != null) 'actor': actor, if (action != null) 'action': action, if (resource != null) 'resource': resource});

  // ─── Billing Analytics ─────────────────────────────────────────────────────
  // Billing invoices are exposed by usageMetering.getInvoices.
  Future<Map<String, dynamic>> getBillingInvoices({int page = 1}) =>
      trpcQuery('usageMetering.getInvoices', {'limit': 20, 'offset': (page - 1) * 20});

  // ─── Chargeback Cases ──────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listChargebackCases({int page = 1, String? status}) =>
      trpcQuery('chargebackMgmt.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  // chargebackMgmt.submitEvidence takes {id, evidence: string, evidenceUrl?, evidenceFileName?}.
  Future<Map<String, dynamic>> submitChargebackEvidence(String caseId, Map<String, dynamic> evidence) =>
      trpcMutation('chargebackMgmt.submitEvidence', {'id': caseId, 'evidence': jsonEncode(evidence)});

  // ─── Fee Schedules ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listFeeSchedules({int page = 1}) =>
      trpcQuery('feeSchedules.list', {'page': page, 'limit': 20});
  Future<Map<String, dynamic>> createFeeSchedule(Map<String, dynamic> data) =>
      trpcMutation('feeSchedules.create', data);
  Future<Map<String, dynamic>> deleteFeeSchedule(String scheduleId) =>
      trpcMutation('feeSchedules.delete', {'id': scheduleId});

  // ─── Fraud Rules ───────────────────────────────────────────────────────────
  // Rule CRUD + toggle lives on fraudRuleEngine (the wave121 fraudRules router
  // only handles alerts + createRule, no list/toggle).
  Future<Map<String, dynamic>> listFraudRules({int page = 1, bool? isActive}) =>
      trpcQuery('fraudRuleEngine.list', {
        'limit': 20,
        'offset': (page - 1) * 20,
        if (isActive != null) 'status': isActive ? 'active' : 'paused',
      });
  // create requires {name, actions[], priority?, status?, ...}.
  Future<Map<String, dynamic>> createFraudRule(Map<String, dynamic> data) =>
      trpcMutation('fraudRuleEngine.create', data);
  Future<Map<String, dynamic>> toggleFraudRule(String ruleId, bool isActive) =>
      trpcMutation('fraudRuleEngine.toggleStatus', {'id': ruleId, 'status': isActive ? 'active' : 'paused'});

  // ─── Invoice Financing ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listInvoiceFinancing({int page = 1, String? status}) =>
      trpcQuery('invoiceFinV2.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  // invoiceFinV2.submitApplication requires {invoiceAmount: int, ...}.
  Future<Map<String, dynamic>> applyForInvoiceFinancing(Map<String, dynamic> data) =>
      trpcMutation('invoiceFinV2.submitApplication', data);

  // ─── KYB Verifications ─────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listKybVerifications({int page = 1, String? status}) =>
      trpcQuery('kybMgmt.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  // BLOCKED: document upload requires kybDocUpload.getUploadUrl with
  // {verificationId, documentType, fileName, mimeType, fileSizeBytes,
  // fileContent} — no generic submitDocument(data) equivalent exists.
  Future<Map<String, dynamic>> submitKybDocument(Map<String, dynamic> data) =>
      trpcMutation('kyb.submitDocument', data);
  // BLOCKED: no zero-arg "own KYB status" proc exists (kybMgmt.getVerification
  // requires a verificationId). Left untouched per fail-loud rule.
  Future<Map<String, dynamic>> getKybStatus() =>
      trpcQuery('kyb.getStatus');

  // ─── Loyalty V3 ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listLoyaltyV3Campaigns({int page = 1}) =>
      trpcQuery('loyaltyV3.listPrograms', {'page': page, 'limit': 20});
  // loyaltyV3.createProgram requires {programName, ...}.
  Future<Map<String, dynamic>> createLoyaltyV3Campaign(Map<String, dynamic> data) =>
      trpcMutation('loyaltyV3.createProgram', data);
  // The only loyalty leaderboard on the server is the tier engine's.
  Future<Map<String, dynamic>> getLoyaltyV3Leaderboard({String period = '30d'}) =>
      trpcQuery('wave27.loyaltyTier.getLeaderboard');

  // ─── Tenant Provisioning ───────────────────────────────────────────────────
  Future<Map<String, dynamic>> listTenants({int page = 1, String? status}) =>
      trpcQuery('tenantMgmt.list', {'page': page, 'limit': 20, if (status != null) 'status': status});
  // tenantMgmt.create requires {id: ten_*, name, slug, email, ...}.
  Future<Map<String, dynamic>> provisionTenant(Map<String, dynamic> data) =>
      trpcMutation('tenantMgmt.create', data);
  Future<Map<String, dynamic>> suspendTenant(String tenantId, String reason) =>
      trpcMutation('tenantMgmt.suspend', {'id': tenantId, 'reason': reason});

  // ─── Virtual Cards (Full) ──────────────────────────────────────────────────
  // BLOCKED: no per-card transactions endpoint exists on any virtualCards*
  // router (create/toggleFreeze/topUp/updateSpendLimit/list + Mw
  // issue/list/freeze/unfreeze/terminate). Left untouched per fail-loud rule.
  Future<Map<String, dynamic>> getVirtualCardTransactions(String cardId, {int page = 1}) =>
      trpcQuery('virtualCards.getTransactions', {'cardId': cardId, 'page': page, 'limit': 20});
  Future<Map<String, dynamic>> setVirtualCardSpendLimit(String cardId, int limitKobo) =>
      trpcMutation('virtualCards.updateSpendLimit', {'id': cardId, 'spendLimit': limitKobo});
  // BLOCKED: no virtualCards stats endpoint exists. Left untouched.
  Future<Map<String, dynamic>> getVirtualCardStats() =>
      trpcQuery('virtualCards.getStats');

  // ─── POS Products ──────────────────────────────────────────────────────────
  // The pos router has no product CRUD (terminals/batches only); the product
  // catalog equivalent is the inventory router (listItems/upsertItem).
  // inventory.listItems takes no input and returns the full list.
  Future<Map<String, dynamic>> listPosProducts({int page = 1, String? category}) =>
      trpcQuery('inventory.listItems');
  // inventory.upsertItem requires {name, currentStock, reorderLevel, costPerUnit, id?}.
  Future<Map<String, dynamic>> createPosProduct(Map<String, dynamic> data) =>
      trpcMutation('inventory.upsertItem', data);
  Future<Map<String, dynamic>> updatePosProduct(String productId, Map<String, dynamic> data) =>
      trpcMutation('inventory.upsertItem', {'id': productId, ...data});
  // BLOCKED: no inventory/product delete endpoint exists. Left untouched.
  Future<Map<String, dynamic>> deletePosProduct(String productId) =>
      trpcMutation('pos.products.delete', {'id': productId});
}

/// Minimal in-memory cache for idempotent GET requests.
///
/// Keyed by request URI plus the Authorization header value (auth scope) so
/// cached responses never leak across sessions. Entries expire after [ttl].
/// Non-GET requests bypass the cache and invalidate all entries for safety.
class _InMemoryGetCacheInterceptor extends Interceptor {
  _InMemoryGetCacheInterceptor({required this.ttl});

  final Duration ttl;
  final Map<String, _CacheEntry> _cache = {};

  String _keyFor(RequestOptions options) =>
      '${options.headers['Authorization'] ?? ''}|${options.uri}';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method != 'GET') {
      _cache.clear();
      return handler.next(options);
    }
    final entry = _cache[_keyFor(options)];
    if (entry != null && DateTime.now().isBefore(entry.expiresAt)) {
      return handler.resolve(entry.response);
    }
    return handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (response.requestOptions.method == 'GET' &&
        response.statusCode != null &&
        response.statusCode! >= 200 &&
        response.statusCode! < 300) {
      final options = response.requestOptions;
      _cache[_keyFor(options)] = _CacheEntry(
        Response<dynamic>(
          requestOptions: options,
          data: response.data,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
        ),
        DateTime.now().add(ttl),
      );
    }
    handler.next(response);
  }
}

class _CacheEntry {
  _CacheEntry(this.response, this.expiresAt);
  final Response<dynamic> response;
  final DateTime expiresAt;
}
