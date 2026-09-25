import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../error/api_failure.dart';
import '../models/account_request.dart';
import '../models/cart.dart';
import '../models/case_file.dart';
import '../models/catalog.dart';
import '../models/document.dart';
import '../models/message.dart';
import '../models/notification.dart';
import '../models/order.dart';
import '../models/site_info.dart';
import '../models/user.dart';
import '../storage/token_store.dart';
import '../utils/json.dart';
import 'api_client.dart';
import 'interceptors.dart';

/// Implementación real contra `/api/v1` (docs/03-contrato-api.md).
class DioApiClient implements ApiClient {
  DioApiClient({
    required TokenStore tokenStore,
    String? baseUrl,
    void Function()? onSessionExpired,
    Dio? dio,
  })  : _store = tokenStore,
        _onSessionExpired = onSessionExpired {
    _dio = dio ??
        Dio(
          BaseOptions(
            baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
            connectTimeout: AppConfig.connectTimeout,
            receiveTimeout: AppConfig.receiveTimeout,
            contentType: Headers.jsonContentType,
            responseType: ResponseType.json,
            headers: <String, dynamic>{'Accept': 'application/json'},
          ),
        );
    _dio.interceptors.addAll(<Interceptor>[
      AuthInterceptor(_store),
      RefreshTokenInterceptor(
        dio: _dio,
        store: _store,
        onSessionExpired: () => _onSessionExpired?.call(),
      ),
      ConnectivityInterceptor(),
    ]);
  }

  final TokenStore _store;
  final void Function()? _onSessionExpired;
  late final Dio _dio;

  Dio get dio => _dio;

  /// Ejecuta una petición normalizando errores en [ApiFailure].
  Future<T> _guard<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on DioException catch (e) {
      throw ApiFailure.fromDio(e);
    } on ApiFailure {
      rethrow;
    } catch (e) {
      throw ApiFailure.unknown(e);
    }
  }

  Options _public() => Options(extra: <String, dynamic>{'public': true});

  // ---------- Público ----------

  @override
  Future<SiteInfo> getSiteInfo() => _guard(() async {
        final res = await _dio.get<dynamic>('/public/site', options: _public());
        return SiteInfo.fromJson(asMap(res.data));
      });

  @override
  Future<List<ProductCategory>> getCategories() => _guard(() async {
        final res = await _dio.get<dynamic>(
          '/public/catalog/categories',
          options: _public(),
        );
        final data = res.data;
        final list = data is List ? asList(data) : asList(asMap(data)['items']);
        return list.map(ProductCategory.fromJson).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      });

  @override
  Future<Paged<Product>> getProducts({
    String? category,
    String? search,
    bool? featured,
    double? minPrice,
    double? maxPrice,
    String sort = 'sortOrder',
    String order = 'asc',
    int page = 1,
    int pageSize = 12,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/public/catalog/products',
          queryParameters: <String, dynamic>{
            if (category != null && category.isNotEmpty) 'category': category,
            if (search != null && search.isNotEmpty) 'search': search,
            if (featured != null) 'featured': featured,
            if (minPrice != null) 'minPrice': minPrice,
            if (maxPrice != null) 'maxPrice': maxPrice,
            'sort': sort,
            'order': order,
            'page': page,
            'pageSize': pageSize,
          },
          options: _public(),
        );
        return Paged<Product>.fromJson(res.data, Product.fromJson);
      });

  @override
  Future<({Product product, List<Product> related})> getProduct(String slug) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/public/catalog/products/$slug',
          options: _public(),
        );
        final map = asMap(res.data);
        final productMap = map.containsKey('product') ? asMap(map['product']) : map;
        return (
          product: Product.fromJson(productMap),
          related: asList(map['related']).map(Product.fromJson).toList(),
        );
      });

  @override
  Future<Paged<Product>> searchProducts(
    String query, {
    int page = 1,
    int pageSize = 12,
  }) =>
      getProducts(search: query, page: page, pageSize: pageSize);

  @override
  Future<AccountRequest> createAccountRequest({
    required String fullName,
    required String email,
    required String phone,
    required String idNumber,
    required ClientType clientType,
    required String password,
    String? company,
    String? message,
  }) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/public/account-requests',
          data: <String, dynamic>{
            'fullName': fullName,
            'email': email,
            'phone': phone,
            'idNumber': idNumber,
            'clientType': clientType.name,
            'password': password,
            'company': company,
            'message': message,
            'source': 'app',
          },
          options: _public(),
        );
        // La respuesta puede indicar aprobación automática y acceso inmediato:
        // `autoApproved`, `canLogin` y, opcionalmente, `temporaryPassword`.
        return AccountRequest.fromJson(asMap(res.data));
      });

  @override
  Future<AccountRequest?> getAccountRequestStatus({
    required String email,
    String? trackingCode,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/public/account-requests/status',
          queryParameters: <String, dynamic>{
            'email': email,
            if (trackingCode != null && trackingCode.isNotEmpty) 'trackingCode': trackingCode,
          },
          options: _public(),
        );
        final map = asMap(res.data);
        if (map.isEmpty) return null;
        return AccountRequest.fromJson(map);
      });

  @override
  Future<void> createQuoteRequest(QuoteRequest request) => _guard(() async {
        await _dio.post<dynamic>(
          '/public/quotes',
          data: request.toJson(),
          options: _public(),
        );
      });

  // ---------- Autenticación ----------

  @override
  Future<AuthSession> login({required String email, required String password}) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/auth/login',
          data: <String, dynamic>{'email': email, 'password': password},
          options: _public(),
        );
        final session = AuthSession.fromJson(asMap(res.data));
        await _store.save(session);
        return session;
      });

  @override
  Future<AuthSession> refresh(String refreshToken) => _guard(() async {
        final res = await _dio.post<dynamic>(
          '/auth/refresh',
          data: <String, dynamic>{'refreshToken': refreshToken},
          options: _public(),
        );
        final session = AuthSession.fromJson(asMap(res.data));
        await _store.save(session);
        return session;
      });

  @override
  Future<void> logout(String refreshToken) async {
    try {
      await _dio.post<dynamic>(
        '/auth/logout',
        data: <String, dynamic>{'refreshToken': refreshToken},
      );
    } on DioException {
      // El cierre local siempre debe funcionar aunque el servidor falle.
    } finally {
      await _store.clear();
    }
  }

  @override
  Future<void> forgotPassword(String email) => _guard(() async {
        await _dio.post<dynamic>(
          '/auth/forgot-password',
          data: <String, dynamic>{'email': email},
          options: _public(),
        );
      });

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      _guard(() async {
        await _dio.post<dynamic>(
          '/auth/change-password',
          data: <String, dynamic>{
            'currentPassword': currentPassword,
            'newPassword': newPassword,
          },
        );
      });

  @override
  Future<AppUser> me() => _guard(() async {
        final res = await _dio.get<dynamic>('/auth/me');
        final map = asMap(res.data);
        final user = AppUser.fromJson(map.containsKey('user') ? asMap(map['user']) : map);
        await _store.updateUser(user);
        return user;
      });

  // ---------- Cliente ----------

  @override
  Future<DashboardSummary> getDashboard() => _guard(() async {
        final res = await _dio.get<dynamic>('/me/dashboard');
        return DashboardSummary.fromJson(asMap(res.data));
      });

  @override
  Future<AppUser> updateProfile({
    String? fullName,
    String? phone,
    String? idNumber,
    String? companyName,
    String? address,
    String? province,
    String? canton,
    String? district,
  }) =>
      _guard(() async {
        final res = await _dio.put<dynamic>(
          '/me/profile',
          data: <String, dynamic>{
            'fullName': fullName,
            'phone': phone,
            'idNumber': idNumber,
            'companyName': companyName,
            'address': address,
            'province': province,
            'canton': canton,
            'district': district,
          },
        );
        final user = AppUser.fromJson(asMap(res.data));
        await _store.updateUser(user);
        return user;
      });

  @override
  Future<Paged<CaseFile>> getCases({
    String? status,
    String? search,
    int page = 1,
    int pageSize = 20,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/cases',
          queryParameters: <String, dynamic>{
            if (status != null && status.isNotEmpty) 'status': status,
            if (search != null && search.isNotEmpty) 'search': search,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<CaseFile>.fromJson(res.data, CaseFile.fromJson);
      });

  @override
  Future<CaseFileDetail> getCase(String id) => _guard(() async {
        final res = await _dio.get<dynamic>('/me/cases/$id');
        return CaseFileDetail.fromJson(asMap(res.data));
      });

  @override
  Future<List<CaseEvent>> getCaseTimeline(String id) => _guard(() async {
        final res = await _dio.get<dynamic>('/me/cases/$id/timeline');
        final data = res.data;
        final list = data is List ? asList(data) : asList(asMap(data)['items']);
        return list.map(CaseEvent.fromJson).toList();
      });

  @override
  Future<Paged<CaseTask>> getTasks({
    String? status,
    int page = 1,
    int pageSize = 50,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/tasks',
          queryParameters: <String, dynamic>{
            if (status != null && status.isNotEmpty) 'status': status,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<CaseTask>.fromJson(res.data, CaseTask.fromJson);
      });

  @override
  Future<CaseTask> completeTask(String id) => _guard(() async {
        final res = await _dio.post<dynamic>('/me/tasks/$id/complete');
        return CaseTask.fromJson(asMap(res.data));
      });

  @override
  Future<Paged<DocumentItem>> getDocuments({
    String? caseFileId,
    String? category,
    int page = 1,
    int pageSize = 30,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/documents',
          queryParameters: <String, dynamic>{
            if (caseFileId != null && caseFileId.isNotEmpty) 'caseFileId': caseFileId,
            if (category != null && category.isNotEmpty) 'category': category,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<DocumentItem>.fromJson(res.data, DocumentItem.fromJson);
      });

  @override
  Future<DocumentItem> uploadDocument({
    required String filePath,
    required String fileName,
    required String category,
    String? caseFileId,
    void Function(int sent, int total)? onProgress,
  }) =>
      _guard(() async {
        final form = FormData.fromMap(<String, dynamic>{
          'file': await MultipartFile.fromFile(filePath, filename: fileName),
          'category': category,
          if (caseFileId != null) 'caseFileId': caseFileId,
        });
        final res = await _dio.post<dynamic>(
          '/me/documents',
          data: form,
          onSendProgress: onProgress,
          options: Options(contentType: 'multipart/form-data'),
        );
        return DocumentItem.fromJson(asMap(res.data));
      });

  @override
  Future<String> getDocumentDownloadUrl(String id) => _guard(() async {
        // La API devuelve un enlace firmado (HMAC, 15 minutos) con la ruta completa,
        // incluido el prefijo de despliegue: /ghcontadores/api/v1/public/files/<token>.
        final res = await _dio.get<dynamic>('/me/documents/$id/link');
        final map = asMap(res.data);
        final url = asStringOr(map['url'], '');
        if (url.isEmpty) {
          throw const ApiFailure(message: 'No se pudo obtener el enlace de descarga del documento.');
        }
        return _absoluteUrl(url);
      });

  /// Convierte una ruta relativa de la API en absoluta conservando el origen desplegado.
  String _absoluteUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    final origin = Uri.parse(AppConfig.apiBaseUrl).origin;
    return url.startsWith('/') ? '$origin$url' : '$origin/$url';
  }

  @override
  Future<Paged<Message>> getMessages({
    String? caseFileId,
    int page = 1,
    int pageSize = 50,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/messages',
          queryParameters: <String, dynamic>{
            if (caseFileId != null && caseFileId.isNotEmpty) 'caseFileId': caseFileId,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<Message>.fromJson(res.data, Message.fromJson);
      });

  @override
  Future<Message> sendMessage({
    required String body,
    String? caseFileId,
    DocumentItem? attachment,
  }) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/me/messages',
          data: <String, dynamic>{
            'body': body,
            if (caseFileId != null) 'caseFileId': caseFileId,
            if (attachment != null) 'attachmentDocumentId': attachment.id,
          },
        );
        return Message.fromJson(asMap(res.data));
      });

  @override
  Future<Cart> getCart() => _guard(() async {
        final res = await _dio.get<dynamic>('/me/cart');
        return Cart.fromJson(asMap(res.data));
      });

  @override
  Future<Cart> addCartItem({
    required String productId,
    int quantity = 1,
    String? notes,
  }) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/me/cart/items',
          data: <String, dynamic>{
            'productId': productId,
            'quantity': quantity,
            'notes': notes,
          },
        );
        return Cart.fromJson(asMap(res.data));
      });

  @override
  Future<Cart> updateCartItem({required String itemId, required int quantity}) =>
      _guard(() async {
        final res = await _dio.patch<dynamic>(
          '/me/cart/items/$itemId',
          data: <String, dynamic>{'quantity': quantity},
        );
        return Cart.fromJson(asMap(res.data));
      });

  @override
  Future<Cart> removeCartItem(String itemId) => _guard(() async {
        final res = await _dio.delete<dynamic>('/me/cart/items/$itemId');
        return Cart.fromJson(asMap(res.data));
      });

  @override
  Future<Cart> clearCart() => _guard(() async {
        // El contrato vacía el carrito con DELETE /me/cart (no /me/cart/items).
        await _dio.delete<dynamic>('/me/cart');
        return Cart.empty;
      });

  @override
  Future<Order> createOrder({
    required List<CartItem> items,
    InvoiceData? invoice,
    bool requiresInvoice = false,
    String? notes,
  }) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/me/orders',
          data: <String, dynamic>{
            'items': items
                .map((e) => <String, dynamic>{
                      'productId': e.product.id,
                      'quantity': e.quantity,
                      'notes': e.notes,
                    })
                .toList(),
            'requiresInvoice': requiresInvoice,
            if (invoice != null) 'invoice': invoice.toJson(),
            if (notes != null) 'notes': notes,
          },
          options: Options(
            headers: <String, dynamic>{
              'Idempotency-Key': 'gh-${DateTime.now().microsecondsSinceEpoch}',
            },
          ),
        );
        return Order.fromJson(asMap(res.data));
      });

  @override
  Future<PaymentResult> payOrder({
    required String orderId,
    required PaymentMethod method,
    CardPaymentData? card,
    String? sinpePhone,
    String? transferReference,
  }) =>
      _guard(() async {
        final res = await _dio.post<dynamic>(
          '/me/orders/$orderId/pay',
          data: <String, dynamic>{
            'method': paymentMethodToJson(method),
            if (card != null) 'card': card.toJson(),
            if (sinpePhone != null) 'reference': sinpePhone,
            if (transferReference != null) 'reference': transferReference,
          },
        );
        return PaymentResult.fromJson(asMap(res.data));
      });

  @override
  Future<Paged<Order>> getOrders({
    String? status,
    int page = 1,
    int pageSize = 20,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/orders',
          queryParameters: <String, dynamic>{
            if (status != null && status.isNotEmpty) 'status': status,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<Order>.fromJson(res.data, Order.fromJson);
      });

  @override
  Future<Order> getOrder(String id) => _guard(() async {
        final res = await _dio.get<dynamic>('/me/orders/$id');
        return Order.fromJson(asMap(res.data));
      });

  @override
  Future<Paged<AppNotification>> getNotifications({
    String? type,
    bool? unreadOnly,
    int page = 1,
    int pageSize = 30,
  }) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/notifications',
          queryParameters: <String, dynamic>{
            if (type != null && type.isNotEmpty) 'type': type,
            if (unreadOnly != null) 'unreadOnly': unreadOnly,
            'page': page,
            'pageSize': pageSize,
          },
        );
        return Paged<AppNotification>.fromJson(res.data, AppNotification.fromJson);
      });

  @override
  Future<void> markNotificationRead(String id) => _guard(() async {
        await _dio.post<dynamic>('/me/notifications/$id/read');
      });

  @override
  Future<void> markAllNotificationsRead() => _guard(() async {
        await _dio.post<dynamic>('/me/notifications/read-all');
      });

  @override
  Future<List<NotificationPreference>> getNotificationPreferences() =>
      _guard(() async {
        final res = await _dio.get<dynamic>('/me/notification-preferences');
        final data = res.data;
        final list = data is List ? asList(data) : asList(asMap(data)['items']);
        return list.map(NotificationPreference.fromJson).toList();
      });

  @override
  Future<List<NotificationPreference>> updateNotificationPreferences(
    List<NotificationPreference> preferences,
  ) =>
      _guard(() async {
        final res = await _dio.put<dynamic>(
          '/me/notification-preferences',
          data: preferences.map((e) => e.toJson()).toList(),
        );
        final data = res.data;
        final list = data is List ? asList(data) : asList(asMap(data)['items']);
        if (list.isEmpty) return preferences;
        return list.map(NotificationPreference.fromJson).toList();
      });

  @override
  Future<void> registerDevice({
    required String token,
    required String platform,
    String? deviceModel,
    String? appVersion,
  }) =>
      _guard(() async {
        await _dio.post<dynamic>(
          '/me/devices',
          data: <String, dynamic>{
            'token': token,
            'platform': platform,
            'deviceModel': deviceModel,
            'appVersion': appVersion,
          },
        );
      });

  @override
  Future<void> unregisterDevice(String token) => _guard(() async {
        await _dio.delete<dynamic>('/me/devices/$token');
      });

  @override
  Future<List<AppNotification>> getNotificationsSince(DateTime since) =>
      _guard(() async {
        final res = await _dio.get<dynamic>(
          '/me/notifications',
          queryParameters: <String, dynamic>{
            'since': since.toUtc().toIso8601String(),
            'pageSize': 50,
          },
        );
        final data = res.data;
        final list = data is List ? asList(data) : asList(asMap(data)['items']);
        return list.map(AppNotification.fromJson).toList();
      });

  @override
  Future<void> deleteAccount() => _guard(() async {
        await _dio.delete<dynamic>('/me/profile');
        await _store.clear();
      });
}
