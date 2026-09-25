import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/guest_provider.dart';
import '../router/app_router.dart';
import '../theme/gh_tokens.dart';
import 'gh_logo.dart';

/// Navega al inicio de sesión guardando la intención a retomar.
///
/// Si [action] es `null` solo se lleva al login.
void goToLogin(BuildContext context, WidgetRef ref, {PendingGuestAction? action}) {
  if (action != null) {
    ref.read(pendingGuestActionProvider.notifier).remember(action);
  }
  context.push(AppRoutes.login);
}

/// Estado vacío de invitado con llamada a la acción.
///
/// Se usa en Mis expedientes, Documentos, Mensajes, Compras y Notificaciones
/// cuando no hay sesión: nunca un error crudo ni una pantalla en blanco.
class GhGuestState extends ConsumerWidget {
  const GhGuestState({
    super.key,
    required this.intent,
    this.secondaryLabel = 'Crear cuenta',
    this.onSecondary,
  });

  final GuestIntent intent;
  final String secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: GhTokens.primary50,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: GhTokens.accent.withValues(alpha: 0.55),
                        width: 3,
                      ),
                    ),
                    child: Icon(intent.icon, size: 42, color: GhTokens.primary),
                  ),
                  const SizedBox(height: 22),
                  GhLogoImage(height: 30),
                  const SizedBox(height: 18),
                  Semantics(
                    header: true,
                    child: Text(
                      intent.title,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    intent.message,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 26),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      key: const Key('guest-login-button'),
                      onPressed: () => goToLogin(
                        context,
                        ref,
                        action: PendingGuestAction(intent: intent),
                      ),
                      icon: const Icon(Icons.login_rounded, size: 18),
                      label: const Text('Iniciar sesión'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      key: const Key('guest-register-button'),
                      onPressed: onSecondary ?? () => context.push(AppRoutes.register),
                      child: Text(secondaryLabel),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () => context.go(AppRoutes.services),
                    icon: const Icon(Icons.grid_view_rounded, size: 16),
                    label: const Text('Explorar el catálogo sin cuenta'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hoja (bottom sheet) para invitados: «Inicie sesión para…».
///
/// Se muestra al intentar una acción que requiere sesión. Devuelve `true`
/// cuando el usuario decide iniciar sesión.
Future<bool> showGuestSheet(
  BuildContext context,
  WidgetRef ref, {
  required GuestIntent intent,
  PendingGuestAction? action,
  bool showRegister = true,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) {
      final theme = Theme.of(sheetContext);
      return Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 8,
          bottom: MediaQuery.viewInsetsOf(sheetContext).bottom + 28,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const GhTopStripe(includeSafeArea: false, height: 4),
            const SizedBox(height: 20),
            GhLogoImage(height: 32),
            const SizedBox(height: 18),
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: GhTokens.primary50,
                shape: BoxShape.circle,
                border: Border.all(
                  color: GhTokens.accent.withValues(alpha: 0.55),
                  width: 3,
                ),
              ),
              child: Icon(intent.icon, size: 28, color: GhTokens.primary),
            ),
            const SizedBox(height: 16),
            Text(
              intent.title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              intent.message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('guest-sheet-login'),
                onPressed: () => Navigator.of(sheetContext).pop(true),
                icon: const Icon(Icons.login_rounded, size: 18),
                label: const Text('Iniciar sesión'),
              ),
            ),
            if (showRegister) ...<Widget>[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  key: const Key('guest-sheet-register'),
                  onPressed: () {
                    Navigator.of(sheetContext).pop(false);
                    context.push(AppRoutes.register);
                  },
                  child: const Text('Crear cuenta'),
                ),
              ),
            ],
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(sheetContext).pop(false),
              child: const Text('Seguir explorando'),
            ),
          ],
        ),
      );
    },
  );

  if (result == true && context.mounted) {
    goToLogin(context, ref, action: action ?? PendingGuestAction(intent: intent));
    return true;
  }
  return false;
}

/// Tarjeta superior para el inicio en modo invitado.
class GhGuestHomeBanner extends ConsumerWidget {
  const GhGuestHomeBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Container(
        decoration: BoxDecoration(
          color: GhTokens.primary,
          borderRadius: GhTokens.cardRadius,
          boxShadow: GhTokens.cardShadow(Theme.of(context).brightness),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: <Widget>[
            const GhTopStripe(includeSafeArea: false, height: 4),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.track_changes_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Inicie sesión para seguir el avance de sus trámites',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            height: 1.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Vea sus expedientes, documentos, mensajes y pagos en un '
                    'solo lugar.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white70,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: FilledButton(
                          key: const Key('guest-banner-login'),
                          onPressed: () => goToLogin(
                            context,
                            ref,
                            action: const PendingGuestAction(
                              intent: GuestIntent.cases,
                            ),
                          ),
                          style: FilledButton.styleFrom(
                            backgroundColor: GhTokens.accent,
                            foregroundColor: GhTokens.primary700,
                          ),
                          child: const Text('Iniciar sesión'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton(
                          key: const Key('guest-banner-register'),
                          onPressed: () => context.push(AppRoutes.register),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: BorderSide(
                              color: Colors.white.withValues(alpha: 0.6),
                            ),
                          ),
                          child: const Text('Crear cuenta'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
