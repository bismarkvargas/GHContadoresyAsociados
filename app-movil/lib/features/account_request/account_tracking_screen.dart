import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/error/api_failure.dart';
import '../../core/models/account_request.dart';
import '../../core/models/user.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/gh_common.dart';

/// Seguimiento de la solicitud de cuenta
/// (`GET /public/account-requests/status`) con actualización en vivo.
class AccountTrackingScreen extends ConsumerStatefulWidget {
  const AccountTrackingScreen({super.key, this.email, this.trackingCode});

  final String? email;
  final String? trackingCode;

  @override
  ConsumerState<AccountTrackingScreen> createState() =>
      _AccountTrackingScreenState();
}

class _AccountTrackingScreenState extends ConsumerState<AccountTrackingScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();

  AccountRequest? _request;
  bool _isLoading = false;
  String? _error;
  DateTime? _lastCheck;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _email.text = widget.email ?? '';
    _code.text = widget.trackingCode ?? '';
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (_email.text.isEmpty) {
        final saved = await ref.read(tokenStoreProvider).getTrackingCode();
        if (saved != null && _code.text.isEmpty) _code.text = saved;
      }
      if (_email.text.isNotEmpty) {
        await _lookup();
        _startPolling();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  void _startPolling() {
    _timer?.cancel();
    // Se refresca solo: cuando el admin aprueba, el estado cambia sin recargar.
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _lookup(silent: true));
  }

  Future<void> _lookup({bool silent = false}) async {
    final email = _email.text.trim();
    if (GhValidators.email(email) != null) {
      if (!silent) {
        setState(() => _error = 'Ingresa un correo electrónico válido para consultar.');
      }
      return;
    }

    if (!silent) setState(() => _isLoading = true);
    try {
      final client = ref.read(apiClientProvider);
      final request = await client.getAccountRequestStatus(
        email: email,
        trackingCode: _code.text.trim().isEmpty ? null : _code.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _request = request;
        _isLoading = false;
        _error = request == null
            ? 'No encontramos una solicitud con esos datos. Verifica el correo '
                'y el código de trámite.'
            : null;
        _lastCheck = DateTime.now();
      });
      if (request != null) {
        await ref.read(tokenStoreProvider).setTrackingCode(request.trackingCode);
      }
    } on ApiFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        if (!silent) _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final request = _request;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Estado de mi solicitud'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
        ),
        actions: <Widget>[
          IconButton(
            onPressed: () => _lookup(),
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Consultar de nuevo',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _lookup,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: <Widget>[
              Text('Consulta por correo', style: theme.textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(
                'Usa el correo con el que enviaste la solicitud y, si lo tienes, '
                'el código de trámite.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Correo electrónico *',
                  prefixIcon: Icon(Icons.mail_outline_rounded),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Código de trámite (opcional)',
                  hintText: 'GH-SOL-0001',
                  prefixIcon: Icon(Icons.confirmation_number_outlined),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _isLoading ? null : () => _lookup(),
                icon: _isLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.search_rounded, size: 18),
                label: Text(_isLoading ? 'Consultando…' : 'Consultar estado'),
              ),
              const SizedBox(height: 24),
              if (_error != null)
                GhInlineNotice(
                  title: 'Sin resultados',
                  message: _error!,
                  color: GhTokens.warning,
                  icon: Icons.search_off_rounded,
                ),
              if (request != null) ...<Widget>[
                GhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(
                                  'Solicitud ${GhFormat.tracking(request.trackingCode)}',
                                  style: theme.textTheme.labelMedium?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  request.fullName,
                                  style: theme.textTheme.titleMedium,
                                ),
                              ],
                            ),
                          ),
                          GhStatusBadge(status: request.status),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _DetailRow(
                        icon: Icons.mail_outline_rounded,
                        label: 'Correo',
                        value: request.email,
                      ),
                      _DetailRow(
                        icon: Icons.phone_outlined,
                        label: 'Teléfono',
                        value: request.phone,
                      ),
                      _DetailRow(
                        icon: Icons.badge_outlined,
                        label: 'Documento',
                        value: request.idNumber,
                      ),
                      _DetailRow(
                        icon: Icons.person_outline_rounded,
                        label: 'Tipo de cliente',
                        value: clientTypeLabel(request.clientType),
                      ),
                      if (request.company != null)
                        _DetailRow(
                          icon: Icons.business_outlined,
                          label: 'Empresa',
                          value: request.company!,
                        ),
                      _DetailRow(
                        icon: Icons.schedule_rounded,
                        label: 'Enviada',
                        value: GhFormat.dateTime(request.createdAt),
                      ),
                      if (request.reviewedAt != null)
                        _DetailRow(
                          icon: Icons.verified_outlined,
                          label: 'Revisada',
                          value: GhFormat.dateTime(request.reviewedAt),
                        ),
                      if (request.rejectionReason != null)
                        _DetailRow(
                          icon: Icons.info_outline_rounded,
                          label: 'Motivo',
                          value: request.rejectionReason!,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _StatusTimeline(status: request.status),
                const SizedBox(height: 16),
                GhInlineNotice(
                  title: 'Actualización automática',
                  message: _lastCheck == null
                      ? 'Consultando…'
                      : 'Última consulta: ${GhFormat.time(_lastCheck)} · se '
                          'actualiza cada 5 segundos.',
                  color: GhTokens.info,
                  icon: Icons.sync_rounded,
                ),
                if (request.isApproved) ...<Widget>[
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => context.go(AppRoutes.login),
                    icon: const Icon(Icons.login_rounded, size: 18),
                    label: const Text('Iniciar sesión con mi cuenta aprobada'),
                  ),
                ],
                if (request.isPending) ...<Widget>[
                  const SizedBox(height: 16),
                  GhInlineNotice(
                    title: 'Mientras esperas',
                    message:
                        'Puedes revisar el catálogo de servicios y sus precios en USD.',
                    color: GhTokens.primary,
                    icon: Icons.lightbulb_outline_rounded,
                    action: OutlinedButton(
                      onPressed: () => context.go(AppRoutes.services),
                      child: const Text('Ver servicios'),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
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
      padding: const EdgeInsets.only(bottom: 10),
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

class _StatusTimeline extends StatelessWidget {
  const _StatusTimeline({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final steps = <({String label, String description, bool done, bool active})>[
      (
        label: 'Solicitud recibida',
        description: 'Registramos tus datos en el CRM de la firma.',
        done: true,
        active: false,
      ),
      (
        label: 'Verificación',
        description: 'Comprobamos tu cédula y datos fiscales.',
        done: status != 'Pending',
        active: status == 'Pending',
      ),
      (
        label: 'Aprobación',
        description: 'El administrador activa tu cuenta de cliente.',
        done: status == 'Approved',
        active: status == 'Approved' || status == 'Rejected',
      ),
      (
        label: 'Acceso al portal',
        description: 'Ya puedes comprar y ver tus expedientes.',
        done: status == 'Approved',
        active: status == 'Approved',
      ),
    ];

    return GhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Progreso del trámite',
              style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 16),
          for (int i = 0; i < steps.length; i++)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Column(
                  children: <Widget>[
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: steps[i].done
                            ? GhTokens.success
                            : steps[i].active
                                ? GhTokens.warning
                                : Theme.of(context).colorScheme.surfaceContainer,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        steps[i].done
                            ? Icons.check_rounded
                            : steps[i].active
                                ? Icons.more_horiz_rounded
                                : Icons.circle_outlined,
                        size: 14,
                        color: steps[i].done || steps[i].active
                            ? Colors.white
                            : Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (i != steps.length - 1)
                      Container(
                        width: 2,
                        height: 38,
                        color: steps[i].done
                            ? GhTokens.success.withValues(alpha: 0.4)
                            : Theme.of(context).colorScheme.outlineVariant,
                      ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          steps[i].label,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontSize: 14,
                              ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          steps[i].description,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
