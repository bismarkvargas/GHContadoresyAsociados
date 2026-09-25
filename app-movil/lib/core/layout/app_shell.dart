import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/cart_provider.dart';
import '../providers/core_providers.dart';
import '../providers/notifications_provider.dart';
import '../theme/gh_tokens.dart';
import '../widgets/in_app_banner.dart';

/// Contenedor de la navegación principal.
///
/// Android → `NavigationBar` (Material 3) · iOS → `CupertinoTabBar`
/// · tablet/escritorio → `NavigationRail`. Respeta safe areas y muestra el
/// badge del carrito y de las notificaciones sin recargar.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const List<_NavItem> _items = <_NavItem>[
    _NavItem(
      label: 'Inicio',
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      cupertinoIcon: CupertinoIcons.house,
      cupertinoActiveIcon: CupertinoIcons.house_fill,
    ),
    _NavItem(
      label: 'Servicios',
      icon: Icons.grid_view_outlined,
      activeIcon: Icons.grid_view_rounded,
      cupertinoIcon: CupertinoIcons.square_grid_2x2,
      cupertinoActiveIcon: CupertinoIcons.square_grid_2x2_fill,
    ),
    _NavItem(
      label: 'Expedientes',
      icon: Icons.folder_open_outlined,
      activeIcon: Icons.folder_rounded,
      cupertinoIcon: CupertinoIcons.folder,
      cupertinoActiveIcon: CupertinoIcons.folder_fill,
    ),
    _NavItem(
      label: 'Carrito',
      icon: Icons.shopping_cart_outlined,
      activeIcon: Icons.shopping_cart_rounded,
      cupertinoIcon: CupertinoIcons.cart,
      cupertinoActiveIcon: CupertinoIcons.cart_fill,
    ),
    _NavItem(
      label: 'Perfil',
      icon: Icons.person_outline_rounded,
      activeIcon: Icons.person_rounded,
      cupertinoIcon: CupertinoIcons.person,
      cupertinoActiveIcon: CupertinoIcons.person_fill,
    ),
  ];

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartBadgeProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final badges = <int, int>{3: cartCount, 0: unread};

    final width = MediaQuery.sizeOf(context).width;
    final isTablet = width >= 720;
    final isIOS = defaultTargetPlatform == TargetPlatform.iOS;

    return InAppBannerHost(
      child: isTablet
          ? Scaffold(
              body: Row(
                children: <Widget>[
                  SafeArea(
                    right: false,
                    child: NavigationRail(
                      selectedIndex: navigationShell.currentIndex,
                      onDestinationSelected: _goBranch,
                      labelType: NavigationRailLabelType.all,
                      destinations: <NavigationRailDestination>[
                        for (int i = 0; i < _items.length; i++)
                          NavigationRailDestination(
                            icon: _BadgedIcon(
                              icon: Icon(_items[i].icon),
                              count: badges[i] ?? 0,
                            ),
                            selectedIcon: _BadgedIcon(
                              icon: Icon(
                                _items[i].activeIcon,
                                color: GhTokens.primary,
                              ),
                              count: badges[i] ?? 0,
                              color: GhTokens.primary,
                            ),
                            label: Text(_items[i].label),
                          ),
                      ],
                    ),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: navigationShell),
                ],
              ),
            )
          : Scaffold(
              body: navigationShell,
              bottomNavigationBar: isIOS
                  ? _CupertinoBar(
                      items: _items,
                      currentIndex: navigationShell.currentIndex,
                      badges: badges,
                      onTap: _goBranch,
                    )
                  : _MaterialBar(
                      items: _items,
                      currentIndex: navigationShell.currentIndex,
                      badges: badges,
                      onTap: _goBranch,
                    ),
            ),
    );
  }
}

class _NavItem {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.cupertinoIcon,
    required this.cupertinoActiveIcon,
  });

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final IconData cupertinoIcon;
  final IconData cupertinoActiveIcon;
}

class _MaterialBar extends StatelessWidget {
  const _MaterialBar({
    required this.items,
    required this.currentIndex,
    required this.badges,
    required this.onTap,
  });

  final List<_NavItem> items;
  final int currentIndex;
  final Map<int, int> badges;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: currentIndex,
      onDestinationSelected: onTap,
      destinations: <Widget>[
        for (int i = 0; i < items.length; i++)
          NavigationDestination(
            icon: _BadgedIcon(
              icon: Icon(items[i].icon, semanticLabel: items[i].label),
              count: badges[i] ?? 0,
            ),
            selectedIcon: _BadgedIcon(
              icon: Icon(
                items[i].activeIcon,
                color: GhTokens.primary,
                semanticLabel: items[i].label,
              ),
              count: badges[i] ?? 0,
              color: GhTokens.primary,
            ),
            label: items[i].label,
          ),
      ],
    );
  }
}

class _CupertinoBar extends StatelessWidget {
  const _CupertinoBar({
    required this.items,
    required this.currentIndex,
    required this.badges,
    required this.onTap,
  });

  final List<_NavItem> items;
  final int currentIndex;
  final Map<int, int> badges;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: isDark ? GhTokens.darkSurface : Colors.white,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: CupertinoTabBar(
          currentIndex: currentIndex,
          onTap: onTap,
          backgroundColor: Colors.transparent,
          border: null,
          height: 56,
          activeColor: GhTokens.primary,
          inactiveColor: GhTokens.muted,
          items: <BottomNavigationBarItem>[
            for (int i = 0; i < items.length; i++)
              BottomNavigationBarItem(
                icon: _BadgedIcon(
                  icon: Icon(items[i].cupertinoIcon, size: 24),
                  count: badges[i] ?? 0,
                  color: GhTokens.primary,
                ),
                activeIcon: _BadgedIcon(
                  icon: Icon(items[i].cupertinoActiveIcon, size: 24),
                  count: badges[i] ?? 0,
                  color: GhTokens.primary,
                ),
                label: items[i].label,
              ),
          ],
        ),
      ),
    );
  }
}

/// Icono con contador (badge) accesible.
class _BadgedIcon extends StatelessWidget {
  const _BadgedIcon({
    required this.icon,
    required this.count,
    this.color,
  });

  final Widget icon;
  final int count;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return icon;
    return Semantics(
      label: '$count pendientes',
      child: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          icon,
          Positioned(
            right: -7,
            top: -5,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16),
              decoration: BoxDecoration(
                color: color ?? GhTokens.primary,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(
                  color: Theme.of(context).colorScheme.surfaceContainerLowest,
                  width: 1.5,
                ),
              ),
              child: Text(
                count > 99 ? '99+' : '$count',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
