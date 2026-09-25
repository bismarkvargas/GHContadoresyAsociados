import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart' show rootBundle;

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
import '../network/api_client.dart';
import '../utils/json.dart';
import 'mock_seed.dart';

/// Modo de autenticación del mock.
///
/// Permite probar el arranque con una cuenta ya activa o con una cuenta
/// `Pending` (pantalla de espera de aprobación).
enum MockAuthMode { active, pending }

/// Sobrescritura de la latencia simulada del modo demo.
///
/// En los tests se pone en [Duration.zero] (`MockApiClient.latencyOverride`):
/// los `Future.delayed` del mock se resuelven en el mismo turno del reloj
/// virtual, de modo que ningún test depende del avance del tiempo real.
@visibleForTesting
Duration? mockLatencyOverride;

/// Modo demo: implementación completa en memoria con el catálogo real
/// (`assets/mock/catalog.seed.json`, 62 servicios) y datos operativos
/// simulados coherentes. No requiere backend.
class MockApiClient implements ApiClient {
  MockApiClient({
    this.latency = const Duration(milliseconds: 420),
    this.authMode = MockAuthMode.active,
  });

  /// Latencia artificial para que skeletons y spinners se vean reales.
  ///
  /// Si [mockLatencyOverride] está definida (tests), tiene prioridad.
  final Duration latency;

  /// Permite probar el arranque con cuenta `Pending`.
  MockAuthMode authMode;

  final Random _rng = Random(7);

  final List<Product> _products = <Product>[];
  final List<ProductCategory> _categories = <ProductCategory>[];
  final List<CaseFile> _cases = <CaseFile>[];
  final List<CaseTask> _tasks = <CaseTask>[];
  final List<DocumentItem> _documents = <DocumentItem>[];
  final List<Message> _messages = <Message>[];
  final List<Order> _orders = <Order>[];
  final List<AppNotification> _notifications = <AppNotification>[];
  final List<AccountRequest> _accountRequests = <AccountRequest>[];
  final List<NotificationPreference> _preferences = <NotificationPreference>[];

  Cart _cart = Cart.empty;
  AppUser? _user;
  AuthSession? _session;
  int _cartSeq = 0;
  int _orderSeq = 11;
  int _docSeq = 100;
  int _msgSeq = 100;

  bool _initialized = false;

  /// Permite inyectar el catálogo semilla ya cargado.
  ///
  /// Se usa en los tests de widget, donde el reloj es ficticio y
  /// `rootBundle.loadString` no completaría dentro del *fake async*.
  @visibleForTesting
  static String? seedCatalogJsonOverride;

  /// Arranca los datos semilla. Idempotente.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    _user = MockSeed.demoUser(active: authMode == MockAuthMode.active);
    _cases.addAll(MockSeed.cases());
    _tasks.addAll(MockSeed.tasks());
    _documents.addAll(MockSeed.documents());
    _messages.addAll(MockSeed.messages());
    _orders.addAll(MockSeed.orders());
    _accountRequests.addAll(MockSeed.accountRequests());
    _preferences.addAll(
      NotificationType.values.map((t) => NotificationPreference(type: t)),
    );
    _notifications.addAll(_seedNotifications());

    await _loadCatalog();
  }

  Future<void> _loadCatalog() async {
    try {
      final raw = seedCatalogJsonOverride ??
          await rootBundle.loadString('assets/mock/catalog.seed.json');
      final decoded = jsonDecode(raw);
      final map = asMap(decoded);

      _categories
        ..clear()
        ..addAll(asList(map['categories']).map(ProductCategory.fromJson));
      _categories.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      _products
        ..clear()
        ..addAll(
          asList(map['products']).map((json) {
            final enrich = <String, dynamic>{
              ...json,
              'id': json['slug'],
              'taxRate': 13,
              'isActive': true,
              'deliveryMode': _deliveryFor(
                asStringOr(json['categorySlug'], 'servicios-contables'),
              ),
            };
            return Product.fromJson(enrich);
          }),
        );
      _products.sort((a, b) {
        if (a.categorySlug == b.categorySlug) return a.name.compareTo(b.name);
        return a.categorySlug.compareTo(b.categorySlug);
      });
    } catch (_) {
      // Si el asset falla, el modo demo sigue funcionando con un catálogo mínimo.
      _categories
        ..clear()
        ..addAll(<ProductCategory>[
          const ProductCategory(
            id: 'servicios-contables',
            slug: 'servicios-contables',
            name: 'Servicios Contables',
            iconName: 'calculator',
            sortOrder: 1,
          ),
          const ProductCategory(
            id: 'servicios-legales',
            slug: 'servicios-legales',
            name: 'Servicios Legales',
            iconName: 'scale',
            sortOrder: 2,
          ),
          const ProductCategory(
            id: 'servicios-municipales',
            slug: 'servicios-municipales',
            name: 'Servicios Municipales',
            iconName: 'building',
            sortOrder: 3,
          ),
          const ProductCategory(
            id: 'servicios-tributarios',
            slug: 'servicios-tributarios',
            name: 'Servicios Tributarios',
            iconName: 'receipt',
            sortOrder: 4,
          ),
        ]);
      _products
        ..clear()
        ..add(
          const Product(
            id: 'declaracion-renta-anual',
            sku: 'GH-D101',
            slug: 'declaracion-renta-anual',
            name: 'Declaración de Renta Anual (D-101)',
            price: 205.31,
            categorySlug: 'servicios-tributarios',
            categoryName: 'Servicios Tributarios',
            description:
                'Preparación y presentación de la declaración anual de renta ante la ATV.',
            isFeatured: true,
          ),
        );
    }
    _refreshCategoryCounts();
  }

  static String _deliveryFor(String categorySlug) {
    switch (categorySlug) {
      case 'servicios-municipales':
        return 'Mixto';
      case 'servicios-legales':
        return 'Mixto';
      case 'servicios-tributarios':
        return 'Digital';
      default:
        return 'Digital';
    }
  }

  void _refreshCategoryCounts() {
    for (int i = 0; i < _categories.length; i++) {
      final c = _categories[i];
      final count = _products.where((p) => p.categorySlug == c.slug).length;
      _categories[i] = ProductCategory(
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        iconName: c.iconName,
        sortOrder: c.sortOrder,
        productCount: count,
        imageUrl: c.imageUrl,
      );
    }
  }

  List<AppNotification> _seedNotifications() => <AppNotification>[
        AppNotification(
          id: 'not-0001',
          title: 'Nuevo mensaje de la firma',
          body:
              'Gustavo Hernández te solicitó la constancia de salario para cerrar la conciliación.',
          type: NotificationType.messageReceived,
          status: 'Sent',
          createdAt: DateTime.now().toUtc().subtract(const Duration(hours: 20)),
          deepLink: '/messages/case-0001',
          caseFileId: 'case-0001',
        ),
        AppNotification(
          id: 'not-0002',
          title: 'Documento disponible',
          body: 'Se agregó «Conciliación bancaria 2025 (borrador).pdf» a tu expediente.',
          type: NotificationType.documentAvailable,
          status: 'Sent',
          createdAt: DateTime.now().toUtc().subtract(const Duration(days: 5)),
          deepLink: '/cases/case-0001',
          caseFileId: 'case-0001',
        ),
        AppNotification(
          id: 'not-0003',
          title: 'Expediente esperando tu firma',
          body: 'La escritura de constitución está lista para firma.',
          type: NotificationType.caseStatusChanged,
          status: 'Sent',
          createdAt: DateTime.now().toUtc().subtract(const Duration(days: 2)),
          deepLink: '/cases/case-0002',
          caseFileId: 'case-0002',
        ),
        AppNotification(
          id: 'not-0004',
          title: 'Pago aprobado',
          body: 'Recibimos tu pago de \$685.00 del pedido GH-ORD-2026-00007.',
          type: NotificationType.orderPaid,
          status: 'Read',
          createdAt: DateTime.now().toUtc().subtract(const Duration(days: 12)),
          readAt: DateTime.now().toUtc().subtract(const Duration(days: 12)),
          deepLink: '/orders/ord-0007',
          orderId: 'ord-0007',
        ),
        AppNotification(
          id: 'not-0005',
          title: 'Tarea por vencer',
          body: 'La tarea «Firmar escritura de constitución» vence en 2 días.',
          type: NotificationType.taskDueSoon,
          status: 'Sent',
          createdAt: DateTime.now().toUtc().subtract(const Duration(hours: 6)),
          deepLink: '/cases/case-0002',
          caseFileId: 'case-0002',
        ),
        AppNotification(
          id: 'not-0006',
          title: 'Bienvenida a la app',
          body: 'Consulta el avance de tus trámites, documentos y pagos en un solo lugar.',
          type: NotificationType.system,
          status: 'Read',
          createdAt: DateTime.now().toUtc().subtract(const Duration(days: 30)),
          readAt: DateTime.now().toUtc().subtract(const Duration(days: 29)),
        ),
      ];

  // ---------- Utilidades ----------

  Future<T> _delay<T>(T value, {Duration? custom}) async {
    // La sobrescritura de tests (0 ms) tiene prioridad sobre cualquier latencia
    // simulada, incluida la de llamadas con `custom` (p. ej. el cobro).
    await _pause(custom ?? latency);
    return value;
  }

  /// Espera la latencia simulada, salvo que los tests la hayan anulado.
  Future<void> _pause(Duration duration) async {
    final effective = mockLatencyOverride ?? duration;
    if (effective > Duration.zero) {
      await Future<void>.delayed(effective);
    }
  }

  void _requireSession() {
    if (_session == null) {
      throw ApiFailure.unauthorized('Inicia sesión para continuar.');
    }
  }

  AppUser get _currentUser => _session?.user ?? MockSeed.demoUser();

  static Paged<T> _page<T>(List<T> all, int page, int pageSize) {
    if (pageSize <= 0) pageSize = all.isEmpty ? 1 : all.length;
    final total = all.length;
    final totalPages = max(1, (total / pageSize).ceil());
    final safePage = page.clamp(1, totalPages);
    final start = (safePage - 1) * pageSize;
    final end = min(start + pageSize, total);
    final items = start >= total ? <T>[] : all.sublist(start, end);
    return Paged<T>(
      items: items,
      total: total,
      page: safePage,
      pageSize: pageSize,
      totalPages: totalPages,
    );
  }

  // ---------- Público ----------

  @override
  Future<SiteInfo> getSiteInfo() => _delay(SiteInfo.fromJson(<String, dynamic>{}));

  @override
  Future<List<ProductCategory>> getCategories() async {
    await init();
    return _delay(List<ProductCategory>.unmodifiable(_categories));
  }

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
  }) async {
    await init();
    Iterable<Product> list = _products.where((p) => p.isActive);

    if (category != null && category.isNotEmpty && category != 'servicios') {
      list = list.where(
        (p) => p.categorySlug == category || p.extraCategories.contains(category),
      );
    }
    if (search != null && search.trim().isNotEmpty) {
      final q = search.trim().toLowerCase();
      list = list.where(
        (p) =>
            p.name.toLowerCase().contains(q) ||
            p.displayDescription.toLowerCase().contains(q) ||
            p.sku.toLowerCase().contains(q),
      );
    }
    if (featured == true) list = list.where((p) => p.isFeatured);
    if (minPrice != null) list = list.where((p) => p.price >= minPrice);
    if (maxPrice != null) list = list.where((p) => p.price <= maxPrice);

    final results = list.toList();
    switch (sort) {
      case 'price':
        results.sort((a, b) => a.price.compareTo(b.price));
        break;
      case 'name':
        results.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        break;
      default:
        results.sort((a, b) {
          if (a.isFeatured != b.isFeatured) return a.isFeatured ? -1 : 1;
          return a.name.compareTo(b.name);
        });
    }
    if (order == 'desc') {
      final reversed = results.reversed.toList();
      results
        ..clear()
        ..addAll(reversed);
    }
    return _delay(_page(results, page, pageSize));
  }

  @override
  Future<({Product product, List<Product> related})> getProduct(String slug) async {
    await init();
    final product = _products.firstWhere(
      (p) => p.slug == slug || p.id == slug,
      orElse: () => _products.isNotEmpty
          ? _products.first
          : throw const ApiFailure(message: 'Servicio no encontrado', statusCode: 404),
    );
    final related = _products
        .where((p) => p.categorySlug == product.categorySlug && p.id != product.id)
        .take(6)
        .toList();
    return _delay((product: product, related: related));
  }

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
    String? company,
    String? message,
  }) async {
    await init();
    final seq = _accountRequests.length + 1;
    final request = AccountRequest(
      id: 'ar-${seq.toString().padLeft(4, '0')}',
      fullName: fullName,
      email: email,
      phone: phone,
      idNumber: idNumber,
      clientType: clientType,
      trackingCode: 'GH-SOL-${seq.toString().padLeft(4, '0')}',
      company: company,
      message: message,
      status: 'Pending',
      createdAt: DateTime.now().toUtc(),
    );
    _accountRequests.add(request);
    return _delay(request);
  }

  @override
  Future<AccountRequest?> getAccountRequestStatus({
    required String email,
    String? trackingCode,
  }) async {
    await init();
    for (final r in _accountRequests) {
      final matchEmail = r.email.toLowerCase() == email.toLowerCase();
      final matchCode = trackingCode == null ||
          trackingCode.isEmpty ||
          r.trackingCode.toLowerCase() == trackingCode.toLowerCase();
      if (matchEmail && matchCode) return _delay(r);
    }
    return _delay(null);
  }

  @override
  Future<void> createQuoteRequest(QuoteRequest request) =>
      _delay(null, custom: const Duration(milliseconds: 600));

  // ---------- Autenticación ----------

  @override
  Future<AuthSession> login({required String email, required String password}) async {
    await init();
    if (email.trim().isEmpty || password.isEmpty) {
      throw const ApiFailure(
        message: 'Ingresa tu correo y contraseña.',
        statusCode: 400,
      );
    }
    if (password.length < 6) {
      throw const ApiFailure(
        message: 'Correo o contraseña incorrectos.',
        statusCode: 401,
      );
    }
    final user = _user!.copyWith(email: email.trim());
    _user = user;
    _session = AuthSession(
      accessToken: 'demo-access-${DateTime.now().millisecondsSinceEpoch}',
      refreshToken: 'demo-refresh-token',
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
      user: user,
      roles: const <String>['Cliente'],
      permissions: const <String>['cases.view', 'documents.view', 'orders.view'],
    );
    return _delay(_session!, custom: const Duration(milliseconds: 700));
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async {
    _session = (_session ??
            AuthSession(
              accessToken: 'demo-access',
              refreshToken: refreshToken,
              expiresAt: DateTime.now().toUtc().add(const Duration(minutes: 30)),
              user: _user ?? MockSeed.demoUser(),
            ))
        .copyWith(
      accessToken: 'demo-access-${DateTime.now().millisecondsSinceEpoch}',
      expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
    );
    return _delay(_session!, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<void> logout(String refreshToken) async {
    _session = null;
    await _delay(null, custom: const Duration(milliseconds: 150));
  }

  @override
  Future<void> forgotPassword(String email) =>
      _delay(null, custom: const Duration(milliseconds: 800));

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    _requireSession();
    if (currentPassword.isEmpty) {
      throw const ApiFailure(message: 'Ingresa tu contraseña actual.', statusCode: 400);
    }
    await _delay(null, custom: const Duration(milliseconds: 700));
  }

  @override
  Future<AppUser> me() async {
    _requireSession();
    return _delay(_currentUser);
  }

  // ---------- Cliente ----------

  @override
  Future<DashboardSummary> getDashboard() async {
    _requireSession();
    final openCases = _cases.where((c) => c.isOpen).length;
    final pendingTasks = _tasks
        .where((t) => !t.isDone && t.status != 'Cancelled' && t.clientActionable)
        .length;

    final upcoming = _tasks.where((t) => !t.isDone).toList()
      ..sort((a, b) {
        final da = a.dueAt;
        final db = b.dueAt;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da.compareTo(db);
      });

    final recentDocs = _documents.where((d) => d.uploadedAt != null).toList()
      ..sort((a, b) => b.uploadedAt!.compareTo(a.uploadedAt!));

    final notifications = List<AppNotification>.from(_notifications)
      ..sort((a, b) {
        final da = a.createdAt ?? DateTime(2000);
        final db = b.createdAt ?? DateTime(2000);
        return db.compareTo(da);
      });

    return _delay(
      DashboardSummary(
        openCases: openCases,
        pendingTasks: pendingTasks,
        newDocuments: recentDocs.length,
        unreadMessages: _messages.where((m) => m.isUnreadByClient).length,
        unreadNotifications: notifications.where((n) => !n.isRead).length,
        pendingOrders: _orders.where((o) => o.isPayable).length,
        featuredProducts: _products
            .where((p) => p.isFeatured)
            .take(8)
            .map((p) => p.toJson())
            .toList(),
        recentCases: _cases.map((c) => c.toJson()).toList(),
        upcomingTasks: upcoming.map((t) => t.toJson()).toList(),
        latestNotifications: notifications.take(5).map((n) => n.toJson()).toList(),
        latestEvents: MockSeed.timeline('case-0001')
            .reversed
            .take(4)
            .map((e) => e.toJson())
            .toList(),
      ),
    );
  }

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
  }) async {
    _requireSession();
    final updated = _currentUser.copyWith(
      fullName: fullName,
      phone: phone,
      idNumber: idNumber,
      companyName: companyName,
      address: address,
      province: province,
      canton: canton,
      district: district,
    );
    _user = updated;
    _session = _session!.copyWith(user: updated);
    return _delay(updated);
  }

  @override
  Future<Paged<CaseFile>> getCases({
    String? status,
    String? search,
    int page = 1,
    int pageSize = 20,
  }) async {
    _requireSession();
    Iterable<CaseFile> list = _cases.where((c) => c.clientVisible);
    if (status != null && status.isNotEmpty && status != 'all') {
      list = list.where((c) => c.status == status);
    }
    if (search != null && search.trim().isNotEmpty) {
      final q = search.trim().toLowerCase();
      list = list.where(
        (c) =>
            c.title.toLowerCase().contains(q) ||
            c.code.toLowerCase().contains(q) ||
            c.matter.toLowerCase().contains(q) ||
            c.entity.toLowerCase().contains(q),
      );
    }
    return _delay(_page(list.toList(), page, pageSize));
  }

  @override
  Future<CaseFileDetail> getCase(String id) async {
    _requireSession();
    final caseFile = _cases.firstWhere(
      (c) => c.id == id || c.code == id,
      orElse: () => throw const ApiFailure(
        message: 'No encontramos el expediente.',
        statusCode: 404,
      ),
    );
    final tasks = _tasks.where((t) => t.caseFileId == caseFile.id).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final docs = _documents.where((d) => d.caseFileId == caseFile.id).toList()
      ..sort((a, b) {
        final da = a.uploadedAt ?? DateTime(2000);
        final db = b.uploadedAt ?? DateTime(2000);
        return db.compareTo(da);
      });
    final timeline = MockSeed.timeline(caseFile.id).reversed.toList();

    return _delay(
      CaseFileDetail(
        caseFile: caseFile,
        timeline: timeline,
        tasks: tasks,
        documents: docs,
      ),
    );
  }

  @override
  Future<List<CaseEvent>> getCaseTimeline(String id) async {
    await init();
    return _delay(MockSeed.timeline(id).reversed.toList());
  }

  @override
  Future<Paged<CaseTask>> getTasks({
    String? status,
    int page = 1,
    int pageSize = 50,
  }) async {
    _requireSession();
    Iterable<CaseTask> list = _tasks;
    if (status != null && status.isNotEmpty && status != 'all') {
      list = list.where((t) => t.status == status);
    }
    final sorted = list.toList()
      ..sort((a, b) {
        if (a.isDone != b.isDone) return a.isDone ? 1 : -1;
        final da = a.dueAt;
        final db = b.dueAt;
        if (da == null) return 1;
        if (db == null) return -1;
        return da.compareTo(db);
      });
    return _delay(_page(sorted, page, pageSize));
  }

  @override
  Future<CaseTask> completeTask(String id) async {
    _requireSession();
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index < 0) {
      throw const ApiFailure(message: 'Tarea no encontrada.', statusCode: 404);
    }
    final updated = _tasks[index].copyWith(
      status: 'Done',
      completedAt: DateTime.now().toUtc(),
    );
    _tasks[index] = updated;

    // El expediente refleja el avance al instante (tiempo real simulado).
    final caseIndex = _cases.indexWhere((c) => c.id == updated.caseFileId);
    if (caseIndex >= 0) {
      final c = _cases[caseIndex];
      final done = _tasks.where((t) => t.caseFileId == c.id && t.isDone).length;
      final total = _tasks.where((t) => t.caseFileId == c.id).length;
      _cases[caseIndex] = c.copyWith(
        tasksDone: done,
        tasksTotal: total,
        progressPercent: total == 0 ? c.progressPercent : ((done / total) * 100).round(),
      );
    }
    return _delay(updated, custom: const Duration(milliseconds: 600));
  }

  @override
  Future<Paged<DocumentItem>> getDocuments({
    String? caseFileId,
    String? category,
    int page = 1,
    int pageSize = 30,
  }) async {
    _requireSession();
    Iterable<DocumentItem> list = _documents.where((d) => d.clientVisible);
    if (caseFileId != null && caseFileId.isNotEmpty) {
      list = list.where((d) => d.caseFileId == caseFileId);
    }
    if (category != null && category.isNotEmpty && category != 'all') {
      list = list.where((d) => d.category == category);
    }
    final sorted = list.toList()
      ..sort((a, b) {
        final da = a.uploadedAt ?? DateTime(2000);
        final db = b.uploadedAt ?? DateTime(2000);
        return db.compareTo(da);
      });
    return _delay(_page(sorted, page, pageSize));
  }

  @override
  Future<DocumentItem> uploadDocument({
    required String filePath,
    required String fileName,
    required String category,
    String? caseFileId,
    void Function(int sent, int total)? onProgress,
  }) async {
    _requireSession();
    _docSeq++;
    const total = 100;
    for (int i = 0; i <= total; i += 10) {
      await _pause(const Duration(milliseconds: 60));
      onProgress?.call(i, total);
    }
    final caseCode = caseFileId == null
        ? null
        : _cases.where((c) => c.id == caseFileId).map((c) => c.code).firstOrNull;

    final doc = DocumentItem(
      id: 'doc-new-$_docSeq',
      caseFileId: caseFileId,
      caseCode: caseCode,
      originalName: fileName,
      category: category,
      contentType: fileName.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'image/jpeg',
      sizeBytes: 480000,
      uploadedByName: _currentUser.fullName,
      uploadedAt: DateTime.now().toUtc(),
      localPath: filePath,
    );
    _documents.insert(0, doc);
    return _delay(doc, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<String> getDocumentDownloadUrl(String id) async => _delay(
        'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        custom: const Duration(milliseconds: 200),
      );

  @override
  Future<Paged<Message>> getMessages({
    String? caseFileId,
    int page = 1,
    int pageSize = 50,
  }) async {
    _requireSession();
    Iterable<Message> list = _messages;
    if (caseFileId != null && caseFileId.isNotEmpty) {
      list = list.where((m) => m.caseFileId == caseFileId);
    }
    final sorted = list.toList()
      ..sort((a, b) {
        final da = a.createdAt ?? DateTime(2000);
        final db = b.createdAt ?? DateTime(2000);
        return da.compareTo(db);
      });
    return _delay(_page(sorted, page, pageSize));
  }

  @override
  Future<Message> sendMessage({
    required String body,
    String? caseFileId,
    DocumentItem? attachment,
  }) async {
    _requireSession();
    _msgSeq++;
    final caseCode = caseFileId == null
        ? null
        : _cases.where((c) => c.id == caseFileId).map((c) => c.code).firstOrNull;
    final message = Message(
      id: 'msg-new-$_msgSeq',
      body: body,
      isFromClient: true,
      caseFileId: caseFileId,
      caseCode: caseCode,
      senderName: _currentUser.fullName,
      attachment: attachment,
      createdAt: DateTime.now().toUtc(),
    );
    _messages.add(message);
    return _delay(message, custom: const Duration(milliseconds: 350));
  }

  @override
  Future<Cart> getCart() async {
    await init();
    return _delay(_cart, custom: const Duration(milliseconds: 250));
  }

  @override
  Future<Cart> addCartItem({
    required String productId,
    int quantity = 1,
    String? notes,
  }) async {
    await init();
    final product = _products.firstWhere(
      (p) => p.id == productId || p.slug == productId,
      orElse: () => throw const ApiFailure(
        message: 'Servicio no encontrado.',
        statusCode: 404,
      ),
    );
    final existing = _cart.items.indexWhere((i) => i.product.id == product.id);
    if (existing >= 0) {
      final item = _cart.items[existing];
      final items = List<CartItem>.from(_cart.items);
      items[existing] = item.copyWith(quantity: item.quantity + quantity);
      _cart = _cart.copyWith(items: items);
    } else {
      _cartSeq++;
      _cart = _cart.copyWith(
        items: <CartItem>[
          ..._cart.items,
          CartItem(
            id: 'ci-$_cartSeq',
            product: product,
            quantity: quantity,
            unitPrice: product.price,
            notes: notes,
            addedAt: DateTime.now().toUtc(),
          ),
        ],
      );
    }
    return _delay(_cart, custom: const Duration(milliseconds: 300));
  }

  @override
  Future<Cart> updateCartItem({required String itemId, required int quantity}) async {
    await init();
    if (quantity <= 0) return removeCartItem(itemId);
    final items = _cart.items
        .map((i) => i.id == itemId ? i.copyWith(quantity: quantity) : i)
        .toList();
    _cart = _cart.copyWith(items: items);
    return _delay(_cart, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<Cart> removeCartItem(String itemId) async {
    await init();
    _cart = _cart.copyWith(
      items: _cart.items.where((i) => i.id != itemId).toList(),
    );
    return _delay(_cart, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<Cart> clearCart() async {
    await init();
    _cart = Cart.empty;
    return _delay(_cart, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<Order> createOrder({
    required List<CartItem> items,
    InvoiceData? invoice,
    bool requiresInvoice = false,
    String? notes,
  }) async {
    await init();
    if (items.isEmpty) {
      throw const ApiFailure(message: 'Tu carrito está vacío.', statusCode: 400);
    }
    double subtotal = 0;
    double tax = 0;
    final orderItems = <OrderItem>[];
    for (final item in items) {
      subtotal += item.lineTotal;
      tax += item.lineTax;
      orderItems.add(
        OrderItem(
          id: 'oi-${DateTime.now().microsecondsSinceEpoch}-${item.product.sku}',
          productId: item.product.id,
          nameSnapshot: item.product.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          total: item.lineTotal,
          imageUrl: item.product.imageUrl,
        ),
      );
    }
    _orderSeq++;
    final order = Order(
      id: 'ord-$_orderSeq',
      number: 'GH-ORD-2026-${_orderSeq.toString().padLeft(5, '0')}',
      status: 'PendingPayment',
      items: orderItems,
      totals: CartTotals(
        subtotal: subtotal,
        discount: 0,
        tax: tax,
        total: subtotal + tax,
      ),
      requiresInvoice: requiresInvoice,
      invoice: invoice,
      notes: notes,
      createdAt: DateTime.now().toUtc(),
    );
    _orders.insert(0, order);
    return _delay(order, custom: const Duration(milliseconds: 700));
  }

  @override
  Future<PaymentResult> payOrder({
    required String orderId,
    required PaymentMethod method,
    CardPaymentData? card,
    String? sinpePhone,
    String? transferReference,
  }) async {
    await init();
    final index = _orders.indexWhere((o) => o.id == orderId);
    if (index < 0) {
      throw const ApiFailure(message: 'Orden no encontrada.', statusCode: 404);
    }
    final order = _orders[index];
    final now = DateTime.now().toUtc();

    // La pasarela simulada tarda ~1.5 s en procesar (la UI anima ese tiempo).
    await _pause(const Duration(milliseconds: 1500));

    String status;
    String? failureReason;
    String? brand;
    String? last4;
    String? authCode;
    String? instructions;

    switch (method) {
      case PaymentMethod.card:
        final digits = card?.digits ?? '';
        status = MockSeed.outcomeForCard(digits);
        brand = _brandFor(digits);
        last4 = card?.last4;
        authCode = status == 'Approved' ? MockSeed.randomReference('AUTH') : null;
        if (status == 'Declined') {
          failureReason = 'Fondos insuficientes o tarjeta rechazada por el emisor.';
        }
        break;
      case PaymentMethod.sinpe:
        // En demo, SINPE siempre queda pendiente de confirmación.
        status = 'Pending';
        instructions =
            'Envía el pago por SINPE Móvil al 8846 9454 desde el número '
            '${sinpePhone ?? "registrado"} y adjunta el comprobante en el expediente.';
        break;
      case PaymentMethod.transfer:
        status = 'Pending';
        instructions =
            'Transfiere a la cuenta BAC Credomatic 9021234567 (GH Contadores y '
            'Asociados S.A.) y adjunta el comprobante.';
        break;
    }

    final payment = PaymentResult(
      id: 'pay-${DateTime.now().millisecondsSinceEpoch}',
      status: status,
      amount: order.totals.total,
      method: method,
      reference: 'GH-PAY-${now.millisecondsSinceEpoch % 1000000}',
      authorizationCode: authCode,
      cardBrand: brand,
      cardLast4: last4,
      cardHolder: card?.holder,
      failureReason: failureReason,
      createdAt: now,
      processedAt: DateTime.now().toUtc().add(const Duration(milliseconds: 1500)),
      instructions: instructions,
    );

    final updatedOrder = order.copyWith(
      status: status == 'Approved' ? 'Paid' : 'PendingPayment',
      payment: payment,
      paidAt: status == 'Approved' ? now : null,
    );
    _orders[index] = updatedOrder;

    if (status == 'Approved') {
      // El pedido genera expediente y notificación (docs/01 §5).
      final newCase = CaseFile(
        id: 'case-${_cases.length + 1}',
        code: 'GH-EXP-2026-${(_cases.length + 1).toString().padLeft(4, '0')}',
        title: order.items.isNotEmpty
            ? order.items.first.nameSnapshot
            : 'Nuevo servicio contratado',
        matter: 'Contable',
        entity: 'Otro',
        status: 'Open',
        description: 'Expediente generado automáticamente desde el pedido ${order.number}.',
        priority: 'Normal',
        responsibleName: 'Gustavo Hernández (Contador)',
        openedAt: now,
        dueAt: now.add(const Duration(days: 10)),
        agreedAmount: order.totals.total,
        progressPercent: 5,
        orderNumber: order.number,
        tasksTotal: 2,
        tasksDone: 0,
        documentsCount: 0,
      );
      _cases.insert(0, newCase);
      _orders[index] = _orders[index].copyWith(
        status: 'InProcess',
        caseCodes: <String>[newCase.code],
      );
      _tasks.addAll(<CaseTask>[
        CaseTask(
          id: 'task-new-${DateTime.now().microsecondsSinceEpoch}',
          caseFileId: newCase.id,
          title: 'Enviar documentación inicial',
          description: 'Adjunta cédula y comprobantes para iniciar el trámite.',
          status: 'Todo',
          priority: 'High',
          dueAt: now.add(const Duration(days: 3)),
          assignedToName: 'Cliente',
          sortOrder: 1,
          clientActionable: true,
        ),
      ]);
      _notifications.insert(
        0,
        AppNotification(
          id: 'not-${DateTime.now().microsecondsSinceEpoch}',
          title: 'Pago aprobado',
          body: 'Recibimos tu pago del pedido ${order.number}. Tu expediente '
              '${newCase.code} ya está abierto.',
          type: NotificationType.orderPaid,
          createdAt: now,
          deepLink: '/orders/${order.id}',
          orderId: order.id,
        ),
      );
      _cart = Cart.empty;
    } else if (status == 'Declined') {      _notifications.insert(
        0,
        AppNotification(
          id: 'not-${DateTime.now().microsecondsSinceEpoch}',
          title: 'Pago rechazado',
          body: 'El pago del pedido ${order.number} no se pudo procesar. '
              'Puedes intentar con otro método.',
          type: NotificationType.paymentFailed,
          createdAt: now,
          deepLink: '/orders/${order.id}',
          orderId: order.id,
        ),
      );
    }

    // La pasarela devuelve también el estado final de la orden y los
    // expedientes generados, para que el app no dependa de una segunda llamada.
    final settledOrder = _orders[index];
    final settledPayment = PaymentResult(
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      method: payment.method,
      provider: payment.provider,
      currency: payment.currency,
      reference: payment.reference,
      authorizationCode: payment.authorizationCode,
      cardBrand: payment.cardBrand,
      cardLast4: payment.cardLast4,
      cardHolder: payment.cardHolder,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      processedAt: payment.processedAt,
      instructions: payment.instructions,
      orderStatus: settledOrder.status,
      caseCodes: settledOrder.caseCodes,
    );

    return _delay(settledPayment, custom: const Duration(milliseconds: 250));
  }

  /// Estado actual de una orden en memoria (útil para demos y pruebas).
  Order? peekOrder(String id) {
    for (final order in _orders) {
      if (order.id == id || order.number == id) return order;
    }
    return null;
  }

  String _brandFor(String digits) {
    if (digits.startsWith('4')) return 'Visa';
    if (digits.startsWith('5')) return 'Mastercard';
    if (digits.startsWith('3')) return 'American Express';
    return 'Tarjeta';
  }

  @override
  Future<Paged<Order>> getOrders({
    String? status,
    int page = 1,
    int pageSize = 20,
  }) async {
    _requireSession();
    Iterable<Order> list = _orders;
    if (status != null && status.isNotEmpty && status != 'all') {
      list = list.where((o) => o.status == status);
    }
    final sorted = list.toList()
      ..sort((a, b) {
        final da = a.createdAt ?? DateTime(2000);
        final db = b.createdAt ?? DateTime(2000);
        return db.compareTo(da);
      });
    return _delay(_page(sorted, page, pageSize));
  }

  @override
  Future<Order> getOrder(String id) async {
    _requireSession();
    final order = _orders.firstWhere(
      (o) => o.id == id || o.number == id,
      orElse: () => throw const ApiFailure(
        message: 'No encontramos el pedido.',
        statusCode: 404,
      ),
    );
    return _delay(order);
  }

  @override
  Future<Paged<AppNotification>> getNotifications({
    String? type,
    bool? unreadOnly,
    int page = 1,
    int pageSize = 30,
  }) async {
    _requireSession();
    Iterable<AppNotification> list = _notifications;
    if (type != null && type.isNotEmpty && type != 'all') {
      final parsed = notificationTypeFrom(type);
      list = list.where((n) => n.type == parsed);
    }
    if (unreadOnly == true) list = list.where((n) => !n.isRead);
    final sorted = list.toList()
      ..sort((a, b) {
        final da = a.createdAt ?? DateTime(2000);
        final db = b.createdAt ?? DateTime(2000);
        return db.compareTo(da);
      });
    return _delay(_page(sorted, page, pageSize));
  }

  @override
  Future<void> markNotificationRead(String id) async {
    await init();
    final index = _notifications.indexWhere((n) => n.id == id);
    if (index >= 0) {
      _notifications[index] = _notifications[index].copyWith(
        readAt: DateTime.now().toUtc(),
      );
    }
    await _delay(null, custom: const Duration(milliseconds: 150));
  }

  @override
  Future<void> markAllNotificationsRead() async {
    await init();
    for (int i = 0; i < _notifications.length; i++) {
      _notifications[i] = _notifications[i].copyWith(readAt: DateTime.now().toUtc());
    }
    await _delay(null, custom: const Duration(milliseconds: 200));
  }

  @override
  Future<List<NotificationPreference>> getNotificationPreferences() async {
    await init();
    return _delay(List<NotificationPreference>.from(_preferences));
  }

  @override
  Future<List<NotificationPreference>> updateNotificationPreferences(
    List<NotificationPreference> preferences,
  ) async {
    await init();
    _preferences
      ..clear()
      ..addAll(preferences);
    return _delay(List<NotificationPreference>.from(_preferences));
  }

  @override
  Future<void> registerDevice({
    required String token,
    required String platform,
    String? deviceModel,
    String? appVersion,
  }) =>
      _delay(null, custom: const Duration(milliseconds: 150));

  @override
  Future<void> unregisterDevice(String token) =>
      _delay(null, custom: const Duration(milliseconds: 150));

  @override
  Future<List<AppNotification>> getNotificationsSince(DateTime since) async {
    await init();
    return _notifications
        .where((n) => (n.createdAt ?? DateTime(2000)).isAfter(since))
        .toList();
  }

  @override
  Future<void> deleteAccount() async {
    _session = null;
    _user = null;
    await _delay(null, custom: const Duration(milliseconds: 400));
  }

  /// Mutaciones usadas por el [MockRealtime] para simular la gestión del admin.
  void simulateAdminApproval() {
    if (_user == null) return;
    _user = _user!.copyWith(status: UserStatus.active);
    _session = _session?.copyWith(user: _user!);
    _notifications.insert(
      0,
      AppNotification(
        id: 'not-${DateTime.now().microsecondsSinceEpoch}',
        title: '¡Cuenta aprobada!',
        body: 'Tu cuenta ya está activa. Explora el catálogo y revisa tus expedientes.',
        type: NotificationType.accountApproved,
        createdAt: DateTime.now().toUtc(),
        deepLink: '/home',
      ),
    );
  }

  void simulateCaseProgress(String caseFileId, {int? progress, String? status}) {
    final index = _cases.indexWhere((c) => c.id == caseFileId);
    if (index < 0) return;
    _cases[index] = _cases[index].copyWith(
      progressPercent: progress ??
          min(100, _cases[index].progressPercent + 10),
      status: status,
    );
  }

  void simulateIncomingMessage({
    required String caseFileId,
    required String body,
    String sender = 'Gustavo Hernández',
  }) {
    _msgSeq++;
    final caseCode = _cases
        .where((c) => c.id == caseFileId)
        .map((c) => c.code)
        .firstOrNull;
    _messages.add(
      Message(
        id: 'msg-new-$_msgSeq',
        body: body,
        isFromClient: false,
        caseFileId: caseFileId,
        caseCode: caseCode,
        senderName: sender,
        createdAt: DateTime.now().toUtc(),
      ),
    );
  }

  void simulateNewNotification(AppNotification notification) {
    _notifications.insert(0, notification);
  }

  List<AppNotification> get notificationsSnapshot =>
      List<AppNotification>.unmodifiable(_notifications);

  int get rngSeed => _rng.nextInt(1000);
}
