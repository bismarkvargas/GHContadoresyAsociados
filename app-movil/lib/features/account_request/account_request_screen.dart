import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/error/api_failure.dart';
import '../../core/models/site_info.dart';
import '../../core/models/user.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_logo.dart';

/// Solicitud de cuenta desde el app (`POST /public/account-requests`).
///
/// El modo de registro lo define el administrador y llega en
/// `GET /public/site → registration`:
///  * `autoApprove: true` → la cuenta queda activa y se inicia sesión al instante.
///  * `autoApprove: false` → la solicitud queda `Pending` y se muestra el
///    seguimiento con código de trámite.
class AccountRequestScreen extends ConsumerStatefulWidget {
  const AccountRequestScreen({super.key});

  @override
  ConsumerState<AccountRequestScreen> createState() =>
      _AccountRequestScreenState();
}

class _AccountRequestScreenState extends ConsumerState<AccountRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController(text: '${AppConfig.crDialCode} ');
  final _idNumber = TextEditingController();
  final _company = TextEditingController();
  final _message = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();

  ClientType _clientType = ClientType.individual;
  bool _isBusy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _idNumber.dispose();
    _company.dispose();
    _message.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _isBusy = true;
      _error = null;
    });

    try {
      final client = ref.read(apiClientProvider);
      final email = _email.text.trim();
      final password = _password.text;
      final request = await client.createAccountRequest(
        fullName: _name.text.trim(),
        email: email,
        phone: _phone.text.trim(),
        idNumber: _idNumber.text.trim(),
        clientType: _clientType,
        password: password,
        company: _company.text.trim().isEmpty ? null : _company.text.trim(),
        message: _message.text.trim().isEmpty ? null : _message.text.trim(),
      );
      await ref.read(tokenStoreProvider).setTrackingCode(request.trackingCode);

      if (!mounted) return;

      // Registro abierto: la cuenta ya está activa → sesión automática.
      if (request.canLogin || request.autoApproved) {
        final ok = await ref.read(authProvider.notifier).login(
              email: email,
              password: request.temporaryPassword ?? password,
            );
        if (!mounted) return;
        setState(() => _isBusy = false);
        if (ok) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '¡Bienvenido, ${_name.text.trim().split(' ').first}! '
                'Su cuenta está activa.',
              ),
            ),
          );
        }
        context.go(AppRoutes.home);
        return;
      }

      // Registro con aprobación: seguimiento con código de trámite.
      setState(() => _isBusy = false);
      context.push(
        '${AppRoutes.accountTracking}'
        '?email=${Uri.encodeComponent(email)}'
        '&code=${Uri.encodeComponent(request.trackingCode)}',
      );
    } on ApiFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _isBusy = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isBusy = false;
        _error = 'No pudimos enviar la solicitud. $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final registration = ref.watch(siteInfoProvider).maybeWhen(
          data: (site) => site.registration,
          orElse: () => const RegistrationConfig(),
        );

    return Scaffold(
      appBar: AppBar(
        title: Text(registration.isAutomatic ? 'Crear cuenta' : 'Solicitar cuenta'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: <Widget>[
              const Center(child: GhTopStripe(includeSafeArea: false, height: 4)),
              const SizedBox(height: 18),
              const Center(child: GhLogoImage(height: 40)),
              const SizedBox(height: 18),
              Text(
                registration.headline,
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 6),
              Text(
                registration.description,
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              if (_error != null) ...<Widget>[
                GhInlineNotice(
                  title: 'No pudimos enviar la solicitud',
                  message: _error!,
                  color: GhTokens.danger,
                  icon: Icons.error_outline_rounded,
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Nombre completo *',
                  prefixIcon: Icon(Icons.person_outline_rounded),
                ),
                validator: GhValidators.fullName,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Correo electrónico *',
                  prefixIcon: Icon(Icons.mail_outline_rounded),
                ),
                validator: GhValidators.email,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]')),
                  LengthLimitingTextInputFormatter(16),
                ],
                decoration: const InputDecoration(
                  labelText: 'Teléfono *',
                  hintText: '+506 8888 8888',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: GhValidators.phoneCr,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _idNumber,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: _clientType == ClientType.company
                      ? 'Cédula jurídica *'
                      : 'Cédula / documento *',
                  hintText: _clientType == ClientType.company
                      ? '3-101-123456'
                      : '1-1234-5678',
                  prefixIcon: const Icon(Icons.badge_outlined),
                ),
                validator: (value) =>
                    GhValidators.idNumber(value, clientType: _clientType.name),
              ),
              const SizedBox(height: 16),
              Text(
                'Tipo de cliente *',
                style: theme.textTheme.labelMedium,
              ),
              const SizedBox(height: 8),
              RadioGroup<ClientType>(
                groupValue: _clientType,
                onChanged: (value) {
                  if (value == null) return;
                  setState(() => _clientType = value);
                },
                child: Column(
                  children: <Widget>[
                    for (final type in ClientType.values)
                      RadioListTile<ClientType>(
                        value: type,
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(clientTypeLabel(type)),
                        subtitle: Text(
                          switch (type) {
                            ClientType.individual =>
                              'Persona física residente con cédula 9 dígitos',
                            ClientType.company =>
                              'Sociedad o empresa con cédula jurídica 10 dígitos',
                            ClientType.foreignInvestor =>
                              'Extranjero o inversionista sin cédula costarricense',
                          },
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _company,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Empresa (opcional)',
                  prefixIcon: Icon(Icons.business_outlined),
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _message,
                maxLines: 4,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Mensaje (opcional)',
                  hintText: 'Cuéntanos qué servicios necesitas…',
                  alignLabelWithHint: true,
                ),
              ),
              const Divider(height: 32),
              Text(
                'Contraseña de acceso',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                registration.isAutomatic
                    ? 'La usará para entrar de inmediato y ver sus compras.'
                    : 'Créela ahora para poder entrar en cuanto aprobemos su cuenta.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Contraseña *',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    tooltip: _obscure ? 'Mostrar contraseña' : 'Ocultar contraseña',
                  ),
                ),
                validator: (value) => GhValidators.password(value, isNew: true),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _confirmPassword,
                obscureText: true,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Confirmar contraseña *',
                  prefixIcon: Icon(Icons.check_circle_outline_rounded),
                ),
                validator: (value) =>
                    GhValidators.confirmPassword(value, _password.text),
              ),
              const SizedBox(height: 8),
              GhInlineNotice(
                message:
                    'Al enviar aceptas que la firma valide tus datos fiscales. '
                    'No compartimos tu información con terceros.',
                color: GhTokens.info,
                icon: Icons.privacy_tip_outlined,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _isBusy ? null : _submit,
                icon: _isBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(
                        registration.isAutomatic
                            ? Icons.person_add_alt_1_rounded
                            : Icons.send_rounded,
                        size: 18,
                      ),
                label: Text(
                  _isBusy
                      ? 'Enviando…'
                      : (registration.isAutomatic
                          ? 'Crear mi cuenta'
                          : 'Enviar solicitud'),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => context.push(AppRoutes.accountTracking),
                child: const Text('Ya envié mi solicitud · Ver estado'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
