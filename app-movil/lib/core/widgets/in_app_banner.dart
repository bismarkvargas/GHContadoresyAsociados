import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/core_providers.dart';
import '../push/push_service.dart';
import '../theme/gh_tokens.dart';

/// Host del banner in-app: muestra los avisos de push y de tiempo real
/// sobre cualquier pantalla, sin recargar la vista.
class InAppBannerHost extends ConsumerStatefulWidget {
  const InAppBannerHost({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<InAppBannerHost> createState() => _InAppBannerHostState();
}

class _InAppBannerHostState extends ConsumerState<InAppBannerHost> {
  int? _shownId;
  Timer? _timer;
  PushPayload? _payload;
  AnimationController? _controller;

  @override
  void dispose() {
    _timer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  void _dismiss() {
    _timer?.cancel();
    if (mounted) setState(() => _payload = null);
  }

  void _open(PushPayload payload) {
    _dismiss();
    final link = payload.deepLink;
    if (link != null && link.isNotEmpty) {
      try {
        context.push(link);
      } catch (_) {
        // Deep link desconocido: se ignora sin romper la navegación.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final banner = ref.watch(inAppBannerProvider);

    if (banner != null && banner.id != _shownId) {
      _shownId = banner.id;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _payload = banner.payload);
        // La notificación local también se refleja en el centro del sistema.
        ref.read(pushServiceProvider).show(banner.payload);
        _timer?.cancel();
        _timer = Timer(const Duration(seconds: 5), _dismiss);
      });
    }

    final payload = _payload;
    return Stack(
      children: <Widget>[
        widget.child,
        if (payload != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _BannerCard(
              payload: payload,
              onTap: () => _open(payload),
              onDismiss: _dismiss,
            ),
          ),
      ],
    );
  }
}

class _BannerCard extends StatefulWidget {
  const _BannerCard({
    required this.payload,
    required this.onTap,
    required this.onDismiss,
  });

  final PushPayload payload;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  State<_BannerCard> createState() => _BannerCardState();
}

class _BannerCardState extends State<_BannerCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  )..forward();

  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, -1),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SlideTransition(
      position: _slide,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Material(
            color: theme.colorScheme.surfaceContainerLowest,
            borderRadius: GhTokens.cardRadius,
            elevation: 6,
            shadowColor: Colors.black26,
            child: InkWell(
              onTap: widget.onTap,
              borderRadius: GhTokens.cardRadius,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: GhTokens.cardRadius,
                  border: Border.all(
                    color: GhTokens.primary.withValues(alpha: 0.35),
                  ),
                ),
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
                      child: const Icon(
                        Icons.notifications_active_outlined,
                        size: 18,
                        color: GhTokens.primary,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            widget.payload.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelLarge,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            widget.payload.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: widget.onDismiss,
                      icon: const Icon(Icons.close_rounded, size: 18),
                      tooltip: 'Cerrar aviso',
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Banner de conectividad / modo demo que aparece bajo la AppBar.
class ConnectionStatusChip extends ConsumerWidget {
  const ConnectionStatusChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final useMocks = ref.watch(useMocksProvider);
    if (useMocks) return const SizedBox.shrink();

    final status = ref.watch(realtimeStatusProvider).valueOrNull;
    if (status == null || status == RealtimeStatus.connected) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: <Widget>[
          const Icon(Icons.cloud_off_rounded, size: 14, color: GhTokens.warning),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              status == RealtimeStatus.reconnecting
                  ? 'Reconectando en tiempo real…'
                  : 'Sin conexión en vivo: actualizando cada 15 s',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
