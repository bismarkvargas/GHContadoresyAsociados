import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../providers/core_providers.dart';
import '../layout/app_shell.dart';
import '../theme/gh_tokens.dart';
import '../widgets/gh_branding.dart';
import '../../features/account_request/account_request_screen.dart';
import '../../features/account_request/account_tracking_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/pending_approval_screen.dart';
import '../../features/cart/cart_screen.dart';
import '../../features/catalog/catalog_screen.dart';
import '../../features/catalog/service_detail_screen.dart';
import '../../features/cases/case_detail_screen.dart';
import '../../features/cases/cases_screen.dart';
import '../../features/checkout/checkout_screen.dart';
import '../../features/documents/documents_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/messages/messages_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/onboarding/onboarding_screen.dart';
import '../../features/orders/order_detail_screen.dart';
import '../../features/orders/orders_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/profile/notification_preferences_screen.dart';
import '../../features/profile/security_screen.dart';
import '../../features/splash/splash_screen.dart';

/// Claves de navegación globales (necesarias para el shell stateful).
final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _homeKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _catalogKey = GlobalKey<NavigatorState>(debugLabel: 'catalog');
final _casesKey = GlobalKey<NavigatorState>(debugLabel: 'cases');
final _cartKey = GlobalKey<NavigatorState>(debugLabel: 'cart');
final _profileKey = GlobalKey<NavigatorState>(debugLabel: 'profile');

/// Rutas de la app (docs/01 §6 + flujos del brief).
class AppRoutes {
  const AppRoutes._();

  static const String splash = '/';
  static const String onboarding = '/onboarding';
  static const String login = '/login';
  static const String register = '/register';
  static const String accountTracking = '/register/tracking';
  static const String pendingApproval = '/pending';
  static const String home = '/home';
  static const String services = '/services';
  static const String cart = '/cart';
  static const String checkout = '/checkout';
  static const String cases = '/cases';
  static const String documents = '/documents';
  static const String messages = '/messages';
  static const String notifications = '/notifications';
  static const String orders = '/orders';
  static const String profile = '/profile';
  static const String notificationPreferences = '/profile/notifications';
  static const String security = '/profile/security';
  static const String about = '/about';

  static String service(String slug) => '/service/$slug';
  static String caseDetail(String id) => '/cases/$id';
  static String chat(String caseId) => '/messages/case/$caseId';
  static String orderDetail(String id) => '/orders/$id';

  /// Convierte un `deepLink` del push en una ruta válida del router.
  static String? normalizeDeepLink(String? link) {
    if (link == null || link.isEmpty) return null;
    if (link.startsWith('/')) return link;
    return '/$link';
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);
  // Mantiene el redirect sincronizado con la sesión guardada.
  ref.watch(apiBootstrapProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: AppRoutes.splash,
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final stage = auth.stage;

      const publicRoutes = <String>{
        AppRoutes.splash,
        AppRoutes.onboarding,
        AppRoutes.login,
      };

      final isPublic = publicRoutes.contains(location) ||
          location.startsWith('/service/') ||
          location.startsWith('/about');

      if (stage == AuthStage.unknown) {
        return location == AppRoutes.splash ? null : AppRoutes.splash;
      }

      if (stage == AuthStage.unauthenticated) {
        // El catálogo público y la solicitud de cuenta están abiertos.
        if (location == AppRoutes.splash) return AppRoutes.services;
        if (location == AppRoutes.pendingApproval) return AppRoutes.services;
        return null;
      }

      // Cuenta pendiente de aprobación: solo la pantalla de espera.
      if (stage == AuthStage.pending) {
        return location == AppRoutes.pendingApproval ? null : AppRoutes.pendingApproval;
      }

      if (stage == AuthStage.suspended || stage == AuthStage.rejected) {
        return location == AppRoutes.login ? null : AppRoutes.login;
      }

      // Cuenta activa: fuera del splash/login/pending.
      if (location == AppRoutes.splash ||
          location == AppRoutes.login ||
          location == AppRoutes.pendingApproval) {
        return AppRoutes.home;
      }

      if (!isPublic && location == AppRoutes.onboarding) {
        return AppRoutes.home;
      }

      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.splash,
        name: 'splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        name: 'onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.register,
        name: 'register',
        builder: (context, state) => const AccountRequestScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountTracking,
        name: 'account-tracking',
        builder: (context, state) => AccountTrackingScreen(
          email: state.uri.queryParameters['email'],
          trackingCode: state.uri.queryParameters['code'],
        ),
      ),
      GoRoute(
        path: AppRoutes.pendingApproval,
        name: 'pending',
        builder: (context, state) => const PendingApprovalScreen(),
      ),

      // Detalle de servicio (abierto también sin sesión).
      GoRoute(
        path: '/service/:slug',
        name: 'service',
        parentNavigatorKey: _rootKey,
        builder: (context, state) => ServiceDetailScreen(
          slug: state.pathParameters['slug'] ?? '',
        ),
      ),

      // Checkout (pantalla completa, sin barra inferior).
      GoRoute(
        path: AppRoutes.checkout,
        name: 'checkout',
        parentNavigatorKey: _rootKey,
        builder: (context, state) => const CheckoutScreen(),
      ),

      // Mensajes: bandeja de hilos como pantalla completa.
      GoRoute(
        path: AppRoutes.messages,
        name: 'messages',
        parentNavigatorKey: _rootKey,
        builder: (context, state) => const MessagesScreen(),
        routes: <RouteBase>[
          GoRoute(
            path: 'case/:caseId',
            name: 'chat',
            parentNavigatorKey: _rootKey,
            builder: (context, state) => MessagesScreen(
              caseFileId: state.pathParameters['caseId'],
            ),
          ),
        ],
      ),

      // Navegación principal con 5 pestañas.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            navigatorKey: _homeKey,
            routes: <RouteBase>[
              GoRoute(
                path: AppRoutes.home,
                name: 'home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _catalogKey,
            routes: <RouteBase>[
              GoRoute(
                path: AppRoutes.services,
                name: 'services',
                builder: (context, state) => const CatalogScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _casesKey,
            routes: <RouteBase>[
              GoRoute(
                path: AppRoutes.cases,
                name: 'cases',
                builder: (context, state) => const CasesScreen(),
                routes: <RouteBase>[
                  GoRoute(
                    path: ':id',
                    name: 'case-detail',
                    parentNavigatorKey: _rootKey,
                    builder: (context, state) => CaseDetailScreen(
                      caseId: state.pathParameters['id'] ?? '',
                      initialTab: state.uri.queryParameters['tab'],
                    ),
                  ),
                ],
              ),
              GoRoute(
                path: AppRoutes.documents,
                name: 'documents',
                parentNavigatorKey: _rootKey,
                builder: (context, state) => DocumentsScreen(
                  caseFileId: state.uri.queryParameters['caseFileId'],
                ),
              ),
              GoRoute(
                path: AppRoutes.notifications,
                name: 'notifications',
                builder: (context, state) => const NotificationsScreen(),
              ),
              GoRoute(
                path: AppRoutes.orders,
                name: 'orders',
                parentNavigatorKey: _rootKey,
                builder: (context, state) => const OrdersScreen(),
                routes: <RouteBase>[
                  GoRoute(
                    path: ':id',
                    name: 'order-detail',
                    parentNavigatorKey: _rootKey,
                    builder: (context, state) => OrderDetailScreen(
                      orderId: state.pathParameters['id'] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _cartKey,
            routes: <RouteBase>[
              GoRoute(
                path: AppRoutes.cart,
                name: 'cart',
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _profileKey,
            routes: <RouteBase>[
              GoRoute(
                path: AppRoutes.profile,
                name: 'profile',
                builder: (context, state) => const ProfileScreen(),
                routes: <RouteBase>[
                  GoRoute(
                    path: 'notifications',
                    name: 'notification-preferences',
                    builder: (context, state) =>
                        const NotificationPreferencesScreen(),
                  ),
                  GoRoute(
                    path: 'security',
                    name: 'security',
                    builder: (context, state) => const SecurityScreen(),
                  ),
                ],
              ),
              GoRoute(
                path: AppRoutes.about,
                name: 'about',
                builder: (context, state) => const _AboutScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => _NotFoundScreen(location: state.uri.toString()),
  );
});

/// Pantalla de marca, contactos y soporte.
class _AboutScreen extends StatelessWidget {
  const _AboutScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Acerca de')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: <Widget>[
          const Center(child: GhLogo(size: 84, showWordmark: false)),
          const SizedBox(height: 16),
          Text(
            'GH Contadores y Asociados',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            'Contabilidad · Trámites legales · Municipales · Tributarios',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          const _InfoRow(
            icon: Icons.location_on_outlined,
            label: 'Dirección',
            value: 'Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste',
          ),
          const _InfoRow(
            icon: Icons.phone_outlined,
            label: 'Teléfonos',
            value: '+506 2653 6634 · +506 8846 9454',
          ),
          const _InfoRow(
            icon: Icons.mail_outline_rounded,
            label: 'Correos',
            value: 'gustavo.ghcontadores@outlook.com\npedidos@ghcontadores.net',
          ),
          const _InfoRow(
            icon: Icons.schedule_rounded,
            label: 'Horario',
            value: 'Lunes a viernes, 8:00 a 17:00 (UTC−6, Costa Rica)',
          ),
          const SizedBox(height: 24),
          Text(
            'Versión 1.0.0 · Elaborada para Android e iOS.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: GhTokens.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(label, style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(height: 2),
                Text(value, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NotFoundScreen extends StatelessWidget {
  const _NotFoundScreen({required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pantalla no encontrada')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.explore_off_outlined, size: 56, color: GhTokens.muted),
              const SizedBox(height: 16),
              Text(
                'No encontramos esta sección',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                location,
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go(AppRoutes.home),
                child: const Text('Ir al inicio'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
