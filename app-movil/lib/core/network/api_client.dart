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
import '../utils/json.dart';

/// Contrato único de acceso a datos (docs/03-contrato-api.md).
///
/// Dos implementaciones intercambiables por Riverpod:
///  * [DioApiClient] → API real (`/api/v1`).
///  * `MockApiClient` → modo demo completo sin backend.
abstract class ApiClient {
  // ---------- Público ----------
  Future<SiteInfo> getSiteInfo();

  Future<List<ProductCategory>> getCategories();

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
  });

  Future<({Product product, List<Product> related})> getProduct(String slug);

  Future<Paged<Product>> searchProducts(String query, {int page = 1, int pageSize = 12});

  Future<AccountRequest> createAccountRequest({
    required String fullName,
    required String email,
    required String phone,
    required String idNumber,
    required ClientType clientType,
    String? company,
    String? message,
  });

  Future<AccountRequest?> getAccountRequestStatus({required String email, String? trackingCode});

  Future<void> createQuoteRequest(QuoteRequest request);

  // ---------- Autenticación ----------
  Future<AuthSession> login({required String email, required String password});

  Future<AuthSession> refresh(String refreshToken);

  Future<void> logout(String refreshToken);

  Future<void> forgotPassword(String email);

  Future<void> changePassword({required String currentPassword, required String newPassword});

  Future<AppUser> me();

  // ---------- Cliente (`/me`) ----------
  Future<DashboardSummary> getDashboard();

  Future<AppUser> updateProfile({
    String? fullName,
    String? phone,
    String? idNumber,
    String? companyName,
    String? address,
    String? province,
    String? canton,
    String? district,
  });

  Future<Paged<CaseFile>> getCases({
    String? status,
    String? search,
    int page = 1,
    int pageSize = 20,
  });

  Future<CaseFileDetail> getCase(String id);

  Future<List<CaseEvent>> getCaseTimeline(String id);

  Future<Paged<CaseTask>> getTasks({String? status, int page = 1, int pageSize = 50});

  Future<CaseTask> completeTask(String id);

  Future<Paged<DocumentItem>> getDocuments({
    String? caseFileId,
    String? category,
    int page = 1,
    int pageSize = 30,
  });

  Future<DocumentItem> uploadDocument({
    required String filePath,
    required String fileName,
    required String category,
    String? caseFileId,
    void Function(int sent, int total)? onProgress,
  });

  Future<String> getDocumentDownloadUrl(String id);

  Future<Paged<Message>> getMessages({String? caseFileId, int page = 1, int pageSize = 50});

  Future<Message> sendMessage({
    required String body,
    String? caseFileId,
    DocumentItem? attachment,
  });

  Future<Cart> getCart();

  Future<Cart> addCartItem({required String productId, int quantity = 1, String? notes});

  Future<Cart> updateCartItem({required String itemId, required int quantity});

  Future<Cart> removeCartItem(String itemId);

  Future<Cart> clearCart();

  Future<Order> createOrder({
    required List<CartItem> items,
    InvoiceData? invoice,
    bool requiresInvoice = false,
    String? notes,
  });

  Future<PaymentResult> payOrder({
    required String orderId,
    required PaymentMethod method,
    CardPaymentData? card,
    String? sinpePhone,
    String? transferReference,
  });

  Future<Paged<Order>> getOrders({String? status, int page = 1, int pageSize = 20});

  Future<Order> getOrder(String id);

  Future<Paged<AppNotification>> getNotifications({
    String? type,
    bool? unreadOnly,
    int page = 1,
    int pageSize = 30,
  });

  Future<void> markNotificationRead(String id);

  Future<void> markAllNotificationsRead();

  Future<List<NotificationPreference>> getNotificationPreferences();

  Future<List<NotificationPreference>> updateNotificationPreferences(
    List<NotificationPreference> preferences,
  );

  Future<void> registerDevice({
    required String token,
    required String platform,
    String? deviceModel,
    String? appVersion,
  });

  Future<void> unregisterDevice(String token);

  /// Consulta incremental usada por el *polling* de respaldo (docs/03 §5).
  Future<List<AppNotification>> getNotificationsSince(DateTime since);

  // ---------- Cuenta ----------
  Future<void> deleteAccount();
}

/// Datos de tarjeta enviados a la pasarela simulada.
class CardPaymentData {
  const CardPaymentData({
    required this.number,
    required this.expiry,
    required this.cvv,
    required this.holder,
  });

  final String number;
  final String expiry;
  final String cvv;
  final String holder;

  String get digits => number.replaceAll(RegExp(r'\D'), '');
  String get last4 => digits.length >= 4 ? digits.substring(digits.length - 4) : digits;

  JsonMap toJson() => <String, dynamic>{
        'number': digits,
        'exp': expiry,
        'cvv': cvv,
        'holder': holder,
      };
}
