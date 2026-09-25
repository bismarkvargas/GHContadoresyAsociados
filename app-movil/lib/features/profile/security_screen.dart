import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';

/// Seguridad: cambio de contraseña (`POST /auth/change-password`).
class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _isBusy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _isBusy = true);
    final error = await ref.read(authProvider.notifier).changePassword(
          currentPassword: _current.text,
          newPassword: _next.text,
        );
    if (!mounted) return;
    setState(() => _isBusy = false);

    if (error == null) {
      _current.clear();
      _next.clear();
      _confirm.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contraseña actualizada correctamente.')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final useMocks = ref.watch(useMocksProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Seguridad')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: <Widget>[
            Text('Cambiar contraseña',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(
              'Usa al menos 8 caracteres combinando letras y números.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _current,
              obscureText: _obscure,
              decoration: InputDecoration(
                labelText: 'Contraseña actual *',
                prefixIcon: const Icon(Icons.lock_outline_rounded),
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(
                    _obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                  tooltip: _obscure ? 'Mostrar' : 'Ocultar',
                ),
              ),
              validator: (value) => GhValidators.password(value),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _next,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Nueva contraseña *',
                prefixIcon: Icon(Icons.lock_reset_rounded),
              ),
              validator: (value) => GhValidators.password(value, isNew: true),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _confirm,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Confirmar nueva contraseña *',
                prefixIcon: Icon(Icons.check_circle_outline_rounded),
              ),
              validator: (value) =>
                  GhValidators.confirmPassword(value, _next.text),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _isBusy ? null : _submit,
              icon: _isBusy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.save_rounded, size: 18),
              label: Text(_isBusy ? 'Guardando…' : 'Actualizar contraseña'),
            ),
            const SizedBox(height: 20),
            GhInlineNotice(
              title: 'Sesiones activas',
              message:
                  'Al cambiar la contraseña se revocan los refresh tokens emitidos '
                  'en otros dispositivos (docs/03 §2).',
              color: GhTokens.info,
              icon: Icons.devices_rounded,
            ),
            if (useMocks) ...<Widget>[
              const SizedBox(height: 16),
              const GhInlineNotice(
                title: 'Modo demo',
                message:
                    'Cualquier contraseña actual es aceptada en el modo demo; la '
                    'validación de la nueva contraseña sí se aplica.',
                color: GhTokens.warning,
                icon: Icons.science_outlined,
              ),
            ],
            const SizedBox(height: 24),
            Text(
              'Soporte directo',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 6),
            Text(
              'Si detectas actividad sospechosa escríbenos a '
              '${AppConfig.contactEmailManagement} o llama al '
              '${AppConfig.contactPhonePrimaryPretty}.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
