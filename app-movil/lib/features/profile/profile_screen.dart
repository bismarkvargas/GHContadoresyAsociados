import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/models/user.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/providers/guest_provider.dart';
import '../../core/providers/push_permission_provider.dart';
import '../../core/push/push_permission_service.dart';
import '../../core/realtime/realtime_service.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/biometric_ui.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_guest.dart';
import '../../core/widgets/gh_logo.dart';
import '../../core/widgets/push_permission_ui.dart';

/// Perfil: datos personales y fiscales, preferencias, contacto directo,
/// modo oscuro, eliminar cuenta y cerrar sesión.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final theme = ref.watch(themeModeProvider);
    final realtime = ref.watch(realtimeStatusProvider).valueOrNull;
    final useMocks = ref.watch(useMocksProvider);
    final themeData = Theme.of(context);

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mi cuenta')),
        body: Column(
          children: <Widget>[
            const GhTopStripe(),
            Expanded(
              child: GhGuestState(
                intent: GuestIntent.cases,
                secondaryLabel: 'Crear cuenta',
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: <Widget>[
          GhCard(
            child: Row(
              children: <Widget>[
                CircleAvatar(
                  radius: 30,
                  backgroundColor: GhTokens.primary50,
                  child: Text(
                    user.initials,
                    style: const TextStyle(
                      color: GhTokens.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 20,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(user.fullName,
                          style: themeData.textTheme.titleLarge),
                      const SizedBox(height: 2),
                      Text(user.email, style: themeData.textTheme.bodySmall),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: <Widget>[
                          GhStatusBadge(
                            status: _statusFor(user.status),
                            compact: true,
                          ),
                          GhStatusBadge(
                            status: 'Active',
                            label: clientTypeLabel(user.clientType),
                            compact: true,
                          ),
                          if (useMocks) const GhDemoChip(),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => _editProfile(context, ref, user),
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'Editar datos',
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Datos fiscales.
          GhSectionHeader(
            title: 'Datos fiscales',
            padding: const EdgeInsets.only(bottom: 8),
          ),
          GhCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _InfoLine(
                  icon: Icons.badge_outlined,
                  label: 'Cédula / NIT',
                  value: user.idNumber ?? 'Sin registrar',
                ),
                _InfoLine(
                  icon: Icons.business_outlined,
                  label: 'Razón social',
                  value: user.companyName ?? 'No aplica',
                ),
                _InfoLine(
                  icon: Icons.phone_outlined,
                  label: 'Teléfono',
                  value: user.phone == null
                      ? 'Sin registrar'
                      : GhFormat.phoneCr(user.phone!),
                ),
                _InfoLine(
                  icon: Icons.location_on_outlined,
                  label: 'Dirección',
                  value: user.address ?? 'Sin registrar',
                ),
                _InfoLine(
                  icon: Icons.map_outlined,
                  label: 'Ubicación',
                  value: <String?>[user.district, user.canton, user.province]
                      .where((e) => e != null && e.isNotEmpty)
                      .join(', ')
                      .ifEmpty('Sin registrar'),
                ),
                _InfoLine(
                  icon: Icons.public_rounded,
                  label: 'Zona horaria',
                  value: user.timeZone,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Preferencias.
          GhSectionHeader(
            title: 'Preferencias',
            padding: const EdgeInsets.only(bottom: 8),
          ),
          GhCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: <Widget>[
                SwitchListTile(
                  value: theme == ThemeMode.dark,
                  onChanged: (value) => ref
                      .read(themeModeProvider.notifier)
                      .set(value ? ThemeMode.dark : ThemeMode.light),
                  secondary: Icon(
                    theme == ThemeMode.dark
                        ? Icons.dark_mode_rounded
                        : Icons.light_mode_rounded,
                    color: GhTokens.primary,
                  ),
                  title: const Text('Modo oscuro'),
                  subtitle: Text(
                    theme == ThemeMode.system
                        ? 'Siguiendo el sistema'
                        : (theme == ThemeMode.dark
                            ? 'Activado'
                            : 'Desactivado'),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.language_rounded,
                      color: GhTokens.primary),
                  title: const Text('Idioma'),
                  subtitle: const Text('Español (Costa Rica) · es-CR'),
                  trailing: const Icon(Icons.lock_outline_rounded, size: 16),
                  enabled: false,
                ),
                const Divider(height: 1),
                const _PushToggleTile(),
                const Divider(height: 1),
                // Acceso sin contraseña: refleja el estado real del dispositivo.
                const BiometricToggleTile(),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.notifications_outlined,
                      color: GhTokens.primary),
                  title: const Text('Preferencias de notificación'),
                  subtitle:
                      const Text('Push, en la app y correo por tipo de aviso'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push(AppRoutes.notificationPreferences),
                ),
                const Divider(height: 1),
                ListTile(
                  leading:
                      const Icon(Icons.sync_rounded, color: GhTokens.primary),
                  title: const Text('Tiempo real'),
                  subtitle: Text(
                    useMocks
                        ? 'Modo demo: eventos simulados cada 12 s'
                        : switch (realtime) {
                            RealtimeStatus.connected =>
                              'Conectado al hub · polling de respaldo cada 15 s',
                            RealtimeStatus.reconnecting =>
                              'Reconectando… (respaldo por polling activo)',
                            RealtimeStatus.disconnected =>
                              'Desconectado · actualización cada 15 s',
                            _ => 'Iniciando conexión…',
                          },
                  ),
                  trailing: Icon(
                    useMocks || realtime == RealtimeStatus.connected
                        ? Icons.cloud_done_rounded
                        : Icons.cloud_off_rounded,
                    size: 18,
                    color: useMocks || realtime == RealtimeStatus.connected
                        ? GhTokens.success
                        : GhTokens.warning,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Seguridad.
          GhSectionHeader(
            title: 'Seguridad',
            padding: const EdgeInsets.only(bottom: 8),
          ),
          GhCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: <Widget>[
                ListTile(
                  leading: const Icon(Icons.lock_reset_rounded,
                      color: GhTokens.primary),
                  title: const Text('Cambiar contraseña'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push(AppRoutes.security),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.person_remove_outlined,
                      color: GhTokens.danger),
                  title: const Text('Eliminar mi cuenta'),
                  subtitle: const Text('Solicita el borrado de tus datos'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _deleteAccount(context, ref),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Compras y soporte.
          GhSectionHeader(
            title: 'Compras y soporte',
            padding: const EdgeInsets.only(bottom: 8),
          ),
          GhCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: <Widget>[
                ListTile(
                  leading: const Icon(Icons.receipt_long_outlined,
                      color: GhTokens.primary),
                  title: const Text('Mis compras'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push(AppRoutes.orders),
                ),
                const Divider(height: 1),
                ListTile(
                  leading:
                      const Icon(Icons.phone_outlined, color: GhTokens.primary),
                  title: const Text('Llamar a la firma'),
                  subtitle: Text(AppConfig.contactPhonePrimaryPretty),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _launch(
                    context,
                    Uri(scheme: 'tel', path: AppConfig.contactPhonePrimary),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading:
                      const Icon(Icons.chat_outlined, color: GhTokens.success),
                  title: const Text('WhatsApp'),
                  subtitle: Text(AppConfig.contactPhoneSecondaryPretty),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _launch(
                    context,
                    Uri.parse(
                      'https://wa.me/${AppConfig.contactPhoneSecondary.replaceAll('+', '')}',
                    ),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.mail_outline_rounded,
                      color: GhTokens.primary),
                  title: const Text('Correo de soporte de pedidos'),
                  subtitle: Text(AppConfig.contactEmailOrders),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _launch(
                    context,
                    Uri(scheme: 'mailto', path: AppConfig.contactEmailOrders),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.work_outline_rounded,
                      color: GhTokens.primary),
                  title: const Text('Correo de gerencia'),
                  subtitle: Text(AppConfig.contactEmailManagement),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _launch(
                    context,
                    Uri(
                        scheme: 'mailto',
                        path: AppConfig.contactEmailManagement),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.info_outline_rounded,
                      color: GhTokens.primary),
                  title: const Text('Acerca de GH Contadores'),
                  subtitle: Text(AppConfig.contactAddress),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push(AppRoutes.about),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _logout(context, ref),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Cerrar sesión'),
            style: OutlinedButton.styleFrom(
              foregroundColor: GhTokens.danger,
              side: const BorderSide(color: GhTokens.danger),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'GH Contadores y Asociados · v1.0.0',
              style: themeData.textTheme.bodySmall,
            ),
          ),
          if (useMocks) ...<Widget>[
            const SizedBox(height: 16),
            GhInlineNotice(
              title: 'Modo demo activo',
              message:
                  'Catálogo real de 62 servicios y datos simulados. La API real se '
                  'activa compilando con --dart-define=USE_MOCKS=false '
                  '--dart-define=API_BASE_URL=…',
              color: GhTokens.warning,
              icon: Icons.science_outlined,
            ),
          ],
        ],
      ),
    );
  }

  static String _statusFor(UserStatus status) {
    switch (status) {
      case UserStatus.active:
        return 'Active';
      case UserStatus.pending:
        return 'Pending';
      case UserStatus.suspended:
        return 'Suspended';
      case UserStatus.rejected:
        return 'Rejected';
    }
  }

  Future<void> _launch(BuildContext context, Uri uri) async {
    try {
      final ok = await launchUrl(uri);
      if (!ok) throw Exception();
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No pudimos abrir ${uri.toString()}')),
      );
    }
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text('¿Deseas salir de tu cuenta en este dispositivo?'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(authProvider.notifier).logout();
    if (!context.mounted) return;
    context.go(AppRoutes.services);
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar mi cuenta'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Se eliminarán tus datos de acceso y se desvincularán tus expedientes '
              'del portal. Los expedientes legales se conservan por obligación '
              'normativa. Escribe ELIMINAR para confirmar.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              decoration: const InputDecoration(labelText: 'Confirmación'),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: GhTokens.danger),
            onPressed: () => Navigator.of(context).pop(
              controller.text.trim().toUpperCase() == 'ELIMINAR',
            ),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final error = await ref.read(authProvider.notifier).deleteAccount();
    if (!context.mounted) return;
    if (error == null) {
      context.go(AppRoutes.services);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tu cuenta fue eliminada.')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  Future<void> _editProfile(
    BuildContext context,
    WidgetRef ref,
    AppUser user,
  ) async {
    final formKey = GlobalKey<FormState>();
    final fullName = TextEditingController(text: user.fullName);
    final phone =
        TextEditingController(text: user.phone ?? AppConfig.crDialCode);
    final idNumber = TextEditingController(text: user.idNumber ?? '');
    final company = TextEditingController(text: user.companyName ?? '');
    final address = TextEditingController(text: user.address ?? '');
    final province = TextEditingController(text: user.province ?? '');
    final canton = TextEditingController(text: user.canton ?? '');
    final district = TextEditingController(text: user.district ?? '');

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 8,
          bottom: MediaQuery.viewInsetsOf(sheetContext).bottom + 24,
        ),
        child: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Editar datos personales y fiscales',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: fullName,
                  decoration:
                      const InputDecoration(labelText: 'Nombre completo *'),
                  validator: GhValidators.fullName,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: idNumber,
                  decoration: const InputDecoration(labelText: 'Cédula / NIT'),
                  validator: (value) => GhValidators.idNumber(value,
                      clientType: user.clientType.name),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: phone,
                  keyboardType: TextInputType.phone,
                  inputFormatters: <TextInputFormatter>[
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]')),
                  ],
                  decoration: const InputDecoration(labelText: 'Teléfono'),
                  validator: GhValidators.phoneCr,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: company,
                  decoration: const InputDecoration(labelText: 'Razón social'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: address,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Dirección'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: TextFormField(
                        controller: province,
                        decoration:
                            const InputDecoration(labelText: 'Provincia'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: canton,
                        decoration: const InputDecoration(labelText: 'Cantón'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: district,
                  decoration: const InputDecoration(labelText: 'Distrito'),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () async {
                      if (!(formKey.currentState?.validate() ?? false)) return;
                      final ok =
                          await ref.read(authProvider.notifier).updateProfile(
                                fullName: fullName.text.trim(),
                                phone: phone.text.trim(),
                                idNumber: idNumber.text.trim(),
                                companyName: company.text.trim(),
                                address: address.text.trim(),
                                province: province.text.trim(),
                                canton: canton.text.trim(),
                                district: district.text.trim(),
                              );
                      if (!sheetContext.mounted) return;
                      Navigator.of(sheetContext).pop();
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            ok
                                ? 'Datos actualizados correctamente.'
                                : 'No pudimos guardar los cambios.',
                          ),
                        ),
                      );
                    },
                    child: const Text('Guardar cambios'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          SizedBox(
            width: 104,
            child: Text(label, style: theme.textTheme.bodySmall),
          ),
          Expanded(
            child: Text(value, style: theme.textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

extension _IfEmpty on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

/// Interruptor «Notificaciones push» que refleja el estado real del permiso.
///
///  * concedido → encendido; apagarlo explica que se gestiona en los ajustes.
///  * sin decidir → al encenderlo pide el permiso del sistema.
///  * bloqueado → ofrece abrir los ajustes (Android ya no muestra el diálogo).
class _PushToggleTile extends ConsumerWidget {
  const _PushToggleTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(pushPermissionProvider);
    final status = statusAsync.valueOrNull;
    final loading = statusAsync.isLoading || status == null;
    final granted = status?.isGranted ?? false;
    final needsSettings = status?.needsSettings ?? false;

    String subtitle;
    if (loading) {
      subtitle = 'Comprobando el estado…';
    } else if (granted) {
      subtitle = 'Activadas en este dispositivo';
    } else if (status == PushPermissionStatus.unavailable) {
      subtitle = 'No disponibles en este dispositivo';
    } else if (needsSettings) {
      subtitle = 'Bloqueadas por el sistema · pulse para abrir los ajustes';
    } else {
      subtitle = 'Desactivadas · actívelas para recibir avisos';
    }

    return SwitchListTile(
      key: const Key('profile-push-toggle'),
      value: granted,
      secondary: Icon(
        granted
            ? Icons.notifications_active_outlined
            : Icons.notifications_off_outlined,
        color: granted ? GhTokens.success : GhTokens.primary,
      ),
      title: const Text('Notificaciones push'),
      subtitle: Text(subtitle),
      onChanged: loading
          ? null
          : (value) async {
              if (!value) {
                // Desactivar push requiere ir a los ajustes del sistema.
                await ref.read(pushPermissionProvider.notifier).openSettings();
                return;
              }
              if (needsSettings) {
                await ref.read(pushPermissionProvider.notifier).openSettings();
                await ref.read(pushPermissionProvider.notifier).refresh();
                return;
              }
              if (status == PushPermissionStatus.unavailable) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Este dispositivo no admite notificaciones push por ahora.',
                    ),
                  ),
                );
                return;
              }
              final ok = await activatePushNotifications(context, ref);
              if (!context.mounted) return;
              if (ok) {
                await ref.read(pushPermissionProvider.notifier).refresh();
              }
            },
    );
  }
}
