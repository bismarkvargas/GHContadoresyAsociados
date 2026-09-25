import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/error/api_failure.dart';
import '../../core/models/user.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';

/// Solicitud de cuenta desde el app (`POST /public/account-requests`).
/// Todos los usuarios creados por esta vía nacen `Pending` (docs/02 §1).
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

  ClientType _clientType = ClientType.individual;
  bool _isBusy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _idNumber.dispose();
    _company.dispose();
    _message.dispose();
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
      final request = await client.createAccountRequest(
        fullName: _name.text.trim(),
        email: _email.text.trim(),
        phone: _phone.text.trim(),
        idNumber: _idNumber.text.trim(),
        clientType: _clientType,
        company: _company.text.trim().isEmpty ? null : _company.text.trim(),
        message: _message.text.trim().isEmpty ? null : _message.text.trim(),
      );
      await ref.read(tokenStoreProvider).setTrackingCode(request.trackingCode);

      if (!mounted) return;
      setState(() => _isBusy = false);
      context.push(
        '${AppRoutes.accountTracking}'
        '?email=${Uri.encodeComponent(request.email)}'
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Solicitar cuenta'),
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
              Text(
                'Cuéntanos quién eres',
                style: theme.textTheme.headlineMedium,
              ),
              const SizedBox(height: 6),
              Text(
                'Un administrador revisará tu solicitud y te avisará por correo '
                'y dentro de la app cuando tu cuenta esté activa.',
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
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(_isBusy ? 'Enviando…' : 'Enviar solicitud'),
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
