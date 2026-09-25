import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/mock/mock_api_client.dart';
import '../../core/models/user.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/widgets/gh_branding.dart';
import '../../core/widgets/gh_common.dart';

/// Pantalla de espera mientras el administrador aprueba la cuenta.
///
/// El estado se consulta en vivo (`/auth/me` + SignalR) y pasa al home sin
/// que el usuario tenga que recargar la vista.
class PendingApprovalScreen extends ConsumerStatefulWidget {
  const PendingApprovalScreen({super.key});

  @override
  ConsumerState<PendingApprovalScreen> createState() =>
      _PendingApprovalScreenState();
}

class _PendingApprovalScreenState extends ConsumerState<PendingApprovalScreen> {
  Timer? _timer;
  int _checks = 0;
  DateTime _lastCheck = DateTime.now();
  String _statusMessage = 'Estamos revisando tu solicitud.';

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _check());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    _checks++;
    try {
      await ref.read(authProvider.notifier).refreshProfile();
      if (!mounted) return;
      setState(() => _lastCheck = DateTime.now());

      final stage = ref.read(authProvider).stage;
      if (stage == AuthStage.active) {
        _timer?.cancel();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('¡Tu cuenta fue aprobada! Bienvenido.')),
        );
        context.go(AppRoutes.home);
      } else if (stage == AuthStage.rejected) {
        _timer?.cancel();
        setState(() => _statusMessage =
            'Tu solicitud no fue aprobada. Escríbenos para revisar el caso.');
      }
    } catch (_) {
      // El polling tolera fallos: se reintenta en el siguiente ciclo.
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final rejected = auth.stage == AuthStage.rejected;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cuenta en revisión'),
        leading: IconButton(
          onPressed: () => context.go(AppRoutes.services),
          icon: const Icon(Icons.grid_view_rounded),
          tooltip: 'Ver catálogo',
        ),
        actions: <Widget>[
          IconButton(
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go(AppRoutes.login);
            },
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Cerrar sesión',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _check,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              const SizedBox(height: 8),
              GhIllustrationView(
                illustration: rejected ? GhIllustration.empty : GhIllustration.success,
                size: 170,
              ),
              const SizedBox(height: 20),
              Text(
                rejected ? 'Solicitud rechazada' : 'Tu cuenta está en revisión',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _statusMessage,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              GhCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        const Icon(
                          Icons.person_outline_rounded,
                          size: 18,
                          color: GhTokens.primary,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Datos de la solicitud',
                          style: theme.textTheme.labelLarge,
                        ),
                        const Spacer(),
                        GhStatusBadge(
                          status: _statusFor(auth.stage),
                          compact: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _Row(label: 'Nombre', value: user?.fullName ?? '—'),
                    _Row(label: 'Correo', value: user?.email ?? '—'),
                    _Row(label: 'Teléfono', value: user?.phone ?? '—'),
                    _Row(
                      label: 'Tipo de cliente',
                      value: user == null
                          ? '—'
                          : clientTypeLabel(user.clientType),
                    ),
                    if (user?.companyName != null)
                      _Row(label: 'Empresa', value: user!.companyName!),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (!rejected)
                GhInlineNotice(
                  title: 'Actualización en vivo',
                  message:
                      'Esta pantalla se actualiza sola cada 5 segundos'
                      '${AppConfig.useMocks ? "" : " (y por SignalR al instante)"}. '
                      'Última verificación: ${_lastCheck.hour.toString().padLeft(2, '0')}:'
                      '${_lastCheck.minute.toString().padLeft(2, '0')}:'
                      '${_lastCheck.second.toString().padLeft(2, '0')} · '
                      '${_checks + 1}ª consulta.',
                  color: GhTokens.info,
                  icon: Icons.sync_rounded,
                ),
              const SizedBox(height: 16),
              GhInlineNotice(
                title: '¿Qué puedes hacer mientras tanto?',
                message:
                    'Explora el catálogo de servicios y revisa precios en USD. '
                    'Cuando tu cuenta esté activa podrás comprar y ver tus expedientes.',
                color: GhTokens.primary,
                icon: Icons.lightbulb_outline_rounded,
                action: OutlinedButton(
                  onPressed: () => context.go(AppRoutes.services),
                  child: const Text('Ver catálogo'),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _check,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Verificar ahora'),
              ),
              if (AppConfig.useMocks) ...<Widget>[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final client = ref.read(apiClientProvider);
                    if (client is MockApiClient) {
                      client.simulateAdminApproval();
                      await _check();
                    }
                  },
                  icon: const Icon(Icons.play_circle_outline_rounded, size: 18),
                  label: const Text('Simular aprobación del administrador'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _statusFor(AuthStage stage) {
    switch (stage) {
      case AuthStage.active:
        return 'Active';
      case AuthStage.rejected:
        return 'Rejected';
      case AuthStage.suspended:
        return 'Suspended';
      case AuthStage.pending:
      case AuthStage.unknown:
      case AuthStage.unauthenticated:
        return 'Pending';
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}
