import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/case_file.dart';
import '../../core/models/catalog.dart';
import '../../core/models/notification.dart';
import '../../core/models/user.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/providers/cases_provider.dart';
import '../../core/providers/catalog_provider.dart';
import '../../core/providers/notifications_provider.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/json.dart';
import '../../core/utils/status_labels.dart';
import '../../core/widgets/gh_branding.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/gh_skeleton.dart';
import '../../core/widgets/gh_state_views.dart';
import '../../core/widgets/in_app_banner.dart';
import '../../core/widgets/product_card.dart';

/// Home del cliente: saludo, accesos rápidos, destacados y estado de trámites.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final dashboard = ref.watch(dashboardProvider);
    final cart = ref.watch(cartProvider);
    final unreadNotifications = ref.watch(unreadNotificationsProvider);
    final isLoggedIn = ref.watch(authProvider).isAuthenticated;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(featuredProductsProvider);
          ref.invalidate(notificationsProvider);
          await ref.read(dashboardProvider.future);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: <Widget>[
            SliverAppBar(
              pinned: true,
              // Alto suficiente para el saludo y el nombre del cliente con la
              // tipografía Montserrat (métricas más altas que la del sistema).
              expandedHeight: 148,
              backgroundColor: Theme.of(context).colorScheme.surface,
              surfaceTintColor: Colors.transparent,
              title: Row(
                children: <Widget>[
                  const GhLogoImage(height: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'GH Contadores',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
              actions: <Widget>[
                IconButton(
                  tooltip: 'Mensajes',
                  onPressed: () => context.push(AppRoutes.messages),
                  icon: const Icon(Icons.forum_outlined),
                ),
                IconButton(
                  tooltip: 'Carrito',
                  onPressed: () => context.go(AppRoutes.cart),
                  icon: Badge(
                    isLabelVisible: cart.itemCount > 0,
                    label: Text('${cart.itemCount}'),
                    child: const Icon(Icons.shopping_cart_outlined),
                  ),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: _GreetingHeader(user: user),
              ),
            ),
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const ConnectionStatusChip(),
                  if (!isLoggedIn) const GhGuestHomeBanner(),
                  dashboard.when(
                    loading: () => const _DashboardSkeleton(),
                    error: (error, _) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GhInlineNotice(
                        title: 'No pudimos actualizar tu resumen',
                        message: 'Desliza hacia abajo para reintentar.',
                        color: GhTokens.warning,
                        icon: Icons.cloud_off_rounded,
                        action: TextButton(
                          onPressed: () => ref.invalidate(dashboardProvider),
                          child: const Text('Reintentar'),
                        ),
                      ),
                    ),
                    data: (data) => _DashboardContent(
                      data: data,
                      cartCount: cart.itemCount,
                      unreadNotifications: unreadNotifications.valueOrNull ?? 0,
                    ),
                  ),
                  const GhSectionHeader(
                    title: 'Servicios destacados',
                    subtitle: 'Los trámites más solicitados por nuestros clientes',
                  ),
                  const _FeaturedCarousel(),
                  const GhSectionHeader(
                    title: 'Últimas novedades',
                    subtitle: 'Movimientos recientes en tus expedientes',
                  ),
                  const _LatestEvents(),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.user});

  final AppUser? user;

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 84, 16, 12),
      child: Row(
        children: <Widget>[
          CircleAvatar(
            radius: 22,
            backgroundColor: GhTokens.primary50,
            child: Text(
              user?.initials ?? 'GH',
              style: const TextStyle(
                color: GhTokens.primary,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  '$_greeting,',
                  style: theme.textTheme.bodySmall,
                ),
                Text(
                  user?.firstName ?? 'bienvenido',
                  style: theme.textTheme.titleLarge,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                user == null ? 'Invitado' : 'Cliente',
                style: theme.textTheme.bodySmall,
              ),
              if (user?.companyName != null)
                SizedBox(
                  width: 110,
                  child: Text(
                    user!.companyName!,
                    textAlign: TextAlign.end,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DashboardContent extends ConsumerWidget {
  const _DashboardContent({
    required this.data,
    required this.cartCount,
    required this.unreadNotifications,
  });

  final Map<String, dynamic> data;
  final int cartCount;
  final int unreadNotifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final openCases = data['openCases'] as int? ?? 0;
    final pendingTasks = data['pendingTasks'] as int? ?? 0;
    final newDocuments = data['newDocuments'] as int? ?? 0;
    final unreadMessages = data['unreadMessages'] as int? ?? 0;
    final recentCases = (data['recentCases'] as List<JsonMap>? ?? <JsonMap>[])
        .map(CaseFile.fromJson)
        .toList();
    final upcomingTasks = (data['upcomingTasks'] as List<JsonMap>? ?? <JsonMap>[])
        .map(CaseTask.fromJson)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const GhSectionHeader(
          title: 'Accesos rápidos',
          padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: <Widget>[
              GhQuickAction(
                label: 'Mis expedientes',
                icon: Icons.folder_open_outlined,
                badge: openCases,
                onTap: () => context.go(AppRoutes.cases),
              ),
              GhQuickAction(
                label: 'Documentos',
                icon: Icons.description_outlined,
                color: GhTokens.info,
                badge: newDocuments,
                onTap: () => context.push(AppRoutes.documents),
              ),
              GhQuickAction(
                label: 'Carrito',
                icon: Icons.shopping_cart_outlined,
                color: GhTokens.success,
                badge: cartCount,
                onTap: () => context.go(AppRoutes.cart),
              ),
              GhQuickAction(
                label: 'Notificaciones',
                icon: Icons.notifications_none_rounded,
                color: GhTokens.warning,
                badge: unreadNotifications,
                onTap: () => context.push(AppRoutes.notifications),
              ),
            ],
          ),
        ),
        const GhSectionHeader(
          title: 'Estado de mis trámites',
          padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: GhMetricCard(
                      label: 'Expedientes activos',
                      value: '$openCases',
                      icon: Icons.folder_shared_outlined,
                      color: GhTokens.primary,
                      onTap: () => context.go(AppRoutes.cases),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GhMetricCard(
                      label: 'Tareas pendientes',
                      value: '$pendingTasks',
                      icon: Icons.checklist_rounded,
                      color: GhTokens.warning,
                      badge: pendingTasks,
                      onTap: () => context.go(AppRoutes.cases),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: <Widget>[
                  Expanded(
                    child: GhMetricCard(
                      label: 'Mensajes sin leer',
                      value: '$unreadMessages',
                      icon: Icons.forum_outlined,
                      color: GhTokens.info,
                      onTap: () => context.push(AppRoutes.messages),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GhMetricCard(
                      label: 'Compras pendientes de pago',
                      value: '${data['pendingOrders'] ?? 0}',
                      icon: Icons.receipt_long_outlined,
                      color: GhTokens.success,
                      onTap: () => context.push(AppRoutes.orders),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const _ChartsCard(),
        const GhSectionHeader(
          title: 'Mis trámites en curso',
          actionLabel: 'Ver todos',
          padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
        ),
        if (recentCases.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: GhInlineNotice(
              message:
                  'Aún no tienes expedientes. Contrata un servicio y se abrirá '
                  'automáticamente tu expediente.',
              color: GhTokens.info,
              icon: Icons.info_outline_rounded,
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: <Widget>[
                for (final c in recentCases.take(2))
                  CaseCard(
                    caseFile: c,
                    onTap: () => context.push(AppRoutes.caseDetail(c.id)),
                  ),
              ],
            ),
          ),
        if (upcomingTasks.isNotEmpty) ...<Widget>[
          const GhSectionHeader(
            title: 'Próximas tareas tuyas',
            padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: <Widget>[
                for (final t in upcomingTasks.take(3))
                  TaskTile(
                    title: t.title,
                    subtitle: t.description,
                    status: t.status,
                    dueAt: t.dueAt,
                    priority: t.priority,
                    showCaseCode: t.caseFileId,
                    onComplete: () => context.push(AppRoutes.caseDetail(t.caseFileId)),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Gráficos de avance con fl_chart (estado y materias de los expedientes).
class _ChartsCard extends ConsumerWidget {
  const _ChartsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(caseStatsProvider);
    final cases = ref.watch(casesProvider);
    final theme = Theme.of(context);

    return stats.maybeWhen(
      data: (data) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
        child: GhCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  const Icon(Icons.insights_rounded, size: 18, color: GhTokens.primary),
                  const SizedBox(width: 8),
                  Text('Resumen visual', style: theme.textTheme.labelLarge),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 150,
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: data.byStatus.isEmpty
                          ? Center(
                              child: Text('Sin datos', style: theme.textTheme.bodySmall),
                            )
                          : PieChart(
                              PieChartData(
                                sectionsSpace: 2,
                                centerSpaceRadius: 26,
                                sections: <PieChartSectionData>[
                                  for (final entry in data.byStatus.entries)
                                    PieChartSectionData(
                                      value: entry.value.toDouble(),
                                      color: GhStatus.color(entry.key),
                                      radius: 34,
                                      title: '${entry.value}',
                                      titleStyle: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 11,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          for (final entry in data.byStatus.entries.take(4))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: <Widget>[
                                  Container(
                                    width: 9,
                                    height: 9,
                                    decoration: BoxDecoration(
                                      color: GhStatus.color(entry.key),
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      GhStatus.label(entry.key),
                                      style: theme.textTheme.bodySmall,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Text(
                                    '${entry.value}',
                                    style: theme.textTheme.labelMedium,
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Divider(),
              const SizedBox(height: 12),
              Row(
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Tareas completadas', style: theme.textTheme.bodySmall),
                        const SizedBox(height: 4),
                        Text(
                          '${data.doneTasks} de ${data.totalTasks}',
                          style: theme.textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 110,
                    height: 56,
                    child: BarChart(
                      BarChartData(
                        alignment: BarChartAlignment.spaceAround,
                        gridData: const FlGridData(show: false),
                        titlesData: const FlTitlesData(show: false),
                        borderData: FlBorderData(show: false),
                        barTouchData: BarTouchData(enabled: false),
                        maxY: (data.totalTasks == 0 ? 1 : data.totalTasks).toDouble(),
                        barGroups: <BarChartGroupData>[
                          BarChartGroupData(
                            x: 0,
                            barRods: <BarChartRodData>[
                              BarChartRodData(
                                toY: data.doneTasks.toDouble(),
                                color: GhTokens.success,
                                width: 16,
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ],
                          ),
                          BarChartGroupData(
                            x: 1,
                            barRods: <BarChartRodData>[
                              BarChartRodData(
                                toY: (data.totalTasks - data.doneTasks)
                                    .clamp(0, 999)
                                    .toDouble(),
                                color: theme.colorScheme.outlineVariant,
                                width: 16,
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              if (cases.valueOrNull != null && cases.value!.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    for (final matter in data.byMatter.keys)
                      Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: GhTokens.surface,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '$matter · ${data.byMatter[matter]}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _FeaturedCarousel extends ConsumerWidget {
  const _FeaturedCarousel();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final featured = ref.watch(featuredProductsProvider);

    return featured.when(
      loading: () => const SizedBox(
        height: 250,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: <Widget>[
              Expanded(child: ProductCardSkeleton()),
              SizedBox(width: 12),
              Expanded(child: ProductCardSkeleton()),
            ],
          ),
        ),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: GhInlineNotice(
          message: 'No pudimos cargar los destacados.',
          color: GhTokens.warning,
          icon: Icons.wifi_off_rounded,
          action: TextButton(
            onPressed: () => ref.invalidate(featuredProductsProvider),
            child: const Text('Reintentar'),
          ),
        ),
      ),
      data: (products) {
        if (products.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: GhInlineNotice(
              message: 'Todavía no hay servicios destacados.',
              color: GhTokens.info,
              icon: Icons.info_outline_rounded,
            ),
          );
        }
        return SizedBox(
          height: 252,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final Product product = products[index];
              return SizedBox(
                width: 172,
                child: ProductCard(product: product),
              );
            },
          ),
        );
      },
    );
  }
}

class _LatestEvents extends ConsumerWidget {
  const _LatestEvents();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardProvider);
    final theme = Theme.of(context);

    return dashboard.when(
      loading: () => const ListSkeleton(count: 3, lines: 1),
      error: (error, _) => const SizedBox.shrink(),
      data: (data) {
        final events = (data['latestEvents'] as List<JsonMap>? ?? <JsonMap>[])
            .map(
              (json) => (
                title: json['title']?.toString() ?? 'Actuación',
                description: json['description']?.toString(),
                createdAt: json['createdAt'] == null
                    ? null
                    : DateTime.tryParse(json['createdAt'].toString()),
                actor: json['actorName']?.toString(),
              ),
            )
            .toList();

        final notifications =
            (data['latestNotifications'] as List<JsonMap>? ?? <JsonMap>[])
                .map(AppNotification.fromJson)
                .toList();

        if (events.isEmpty && notifications.isEmpty) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: GhEmptyState(
              title: 'Sin novedades por ahora',
              message:
                  'Cuando la firma registre una actuación o un documento, lo verás aquí.',
              illustration: GhIllustration.empty,
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: <Widget>[
              for (final n in notifications.take(2))
                GhCard(
                  margin: const EdgeInsets.only(bottom: 10),
                  onTap: () => context.push(AppRoutes.notifications),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: GhTokens.primary50,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          notificationTypeIcon(n.type),
                          size: 17,
                          color: GhTokens.primary,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              n.title,
                              style: theme.textTheme.titleMedium?.copyWith(
                                    fontSize: 14,
                                  ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              n.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              GhFormat.relative(n.createdAt),
                              style: theme.textTheme.bodySmall?.copyWith(
                                    fontSize: 11,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              for (final e in events.take(3))
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Column(
                        children: <Widget>[
                          Container(
                            width: 10,
                            height: 10,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: const BoxDecoration(
                              color: GhTokens.primary,
                              shape: BoxShape.circle,
                            ),
                          ),
                          Container(
                            width: 2,
                            height: 40,
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ],
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              e.title,
                              style: theme.textTheme.titleMedium?.copyWith(
                                    fontSize: 14,
                                  ),
                            ),
                            if (e.description != null)
                              Text(
                                e.description!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall,
                              ),
                            const SizedBox(height: 2),
                            Text(
                              '${e.actor ?? "Sistema"} · ${GhFormat.relative(e.createdAt)}',
                              style: theme.textTheme.bodySmall?.copyWith(
                                    fontSize: 11,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

}

class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        children: <Widget>[
          Row(
            children: const <Widget>[
              Expanded(child: ShimmerBox(width: double.infinity, height: 96)),
              SizedBox(width: 12),
              Expanded(child: ShimmerBox(width: double.infinity, height: 96)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: const <Widget>[
              Expanded(child: ShimmerBox(width: double.infinity, height: 96)),
              SizedBox(width: 12),
              Expanded(child: ShimmerBox(width: double.infinity, height: 96)),
            ],
          ),
          const SizedBox(height: 16),
          const CaseCardSkeleton(),
        ],
      ),
    );
  }
}
