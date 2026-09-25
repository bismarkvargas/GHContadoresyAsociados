import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/mock/mock_seed.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/biometric_provider.dart';
import '../../core/providers/core_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/gh_tokens.dart';
import '../../core/utils/validators.dart';
import '../../core/widgets/biometric_ui.dart';
import '../../core/widgets/gh_common.dart';
import '../../core/widgets/gh_logo.dart';

/// Inicio de sesión (`POST /auth/login`), con acceso opcional por huella.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;

  /// La huella se pide **una sola vez por visita** a la pantalla: sin esta
  /// marca, cada reconstrucción volvería a abrir el diálogo del sistema.
  bool _biometricAttemptedThisVisit = false;
  bool _offeringBiometric = false;

  /// Formulario de correo y contraseña: se resalta cuando el usuario pulsa la
  /// huella sin tenerla todavía vinculada (el aviso solo no basta, hay que
  /// llevarlo al formulario).
  final _formKeyField = GlobalKey();
  bool _highlightForm = false;
  Timer? _highlightTimer;

  @override
  void initState() {
    super.initState();
    if (AppConfig.useMocks) {
      _emailController.text = MockSeed.demoUser().email;
      _passwordController.text = MockSeed.demoPassword;
    }
    // El botón de huella avisa cuando hace falta pasar por el formulario.
    onBiometricNeedsPasswordForm = _focusPasswordForm;
    // Petición automática de huella al abrir la pantalla (si está activada).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _maybeAutoBiometric();
    });
  }

  @override
  void dispose() {
    onBiometricNeedsPasswordForm = null;
    _highlightTimer?.cancel();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Baja hasta el formulario de correo y contraseña y lo resalta un momento.
  void _focusPasswordForm() {
    if (!mounted) return;
    final context = _formKeyField.currentContext;
    if (context != null) {
      Scrollable.ensureVisible(
        context,
        duration: const Duration(milliseconds: 400),
        alignment: 0.2,
      );
    }
    setState(() => _highlightForm = true);
    ScaffoldMessenger.of(context ?? this.context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'Ingrese con su correo y contraseña para activar la huella.',
          ),
        ),
      );
    // El temporizador se cancela al salir de la pantalla: un `Timer` vivo
    // después de desmontar haría fallar también a los tests.
    _highlightTimer?.cancel();
    _highlightTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _highlightForm = false);
    });
  }

  /// Pide la huella automáticamente al abrir la pantalla.
  ///
  /// Solo ocurre cuando el usuario la activó y el dispositivo la soporta.
  /// [_biometricAttemptedThisVisit] garantiza que no se repita: ni al
  /// reconstruirse la pantalla, ni en bucle si el usuario cancela.
  Future<void> _maybeAutoBiometric() async {
    if (_biometricAttemptedThisVisit || !mounted) return;
    if (ref.read(authProvider).isAuthenticated) return;

    // Espera a que el provider termine de consultar el dispositivo.
    for (int i = 0; i < 8; i++) {
      final state = ref.read(biometricProvider);
      if (!state.isChecking) break;
      await Future<void>.delayed(const Duration(milliseconds: 120));
      if (!mounted) return;
    }

    final biometric = ref.read(biometricProvider);
    if (!biometric.canUseBiometrics || !mounted) return;

    _biometricAttemptedThisVisit = true;
    final ok = await attemptBiometricLogin(context, ref, automatic: true);
    if (ok && mounted) _goAfterLogin();
  }

  /// Navega al inicio (o a la espera de aprobación) según el estado real.
  void _goAfterLogin() {
    if (!mounted) return;
    final stage = ref.read(authProvider).stage;
    context.go(stage == AuthStage.pending
        ? AppRoutes.pendingApproval
        : AppRoutes.home);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final ok = await ref.read(authProvider.notifier).login(
          email: _emailController.text,
          password: _passwordController.text,
        );

    if (!mounted) return;
    if (ok) {
      // Se aprovecha el primer inicio de sesión con contraseña para ofrecer la
      // huella (una sola vez; la sesión ya quedó guardada por TokenStore).
      await _maybeOfferBiometric();
      _goAfterLogin();
    }
  }

  /// Ofrece activar la huella justo después de iniciar sesión con contraseña.
  ///
  /// Nunca se ofrece a invitados, ni sin sensor, ni sin huellas registradas, ni
  /// dos veces: `gh_biometric_offered` recuerda la respuesta.
  ///
  /// Ojo con la carrera: si la consulta al sensor todavía está en curso, el
  /// estado del dispositivo **no** está decidido. Marcarlo como «ya ofrecido»
  /// en ese momento era el fallo que hacía que el aviso no apareciera nunca y
  /// obligaba a activar la huella desde el perfil a mano.
  Future<void> _maybeOfferBiometric() async {
    if (_offeringBiometric || !mounted) return;
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;

    // Se resuelve el notificador **antes** de abrir el diálogo: el login se
    // desmonta al entrar al inicio y el provider dejaría de estar disponible.
    final notifier = ref.read(biometricProvider.notifier);
    final yaOfrecido = await notifier.wasOffered();
    if (yaOfrecido) return;
    if (!mounted) return;

    // Espera a que el provider termine de consultar el dispositivo.
    for (int i = 0; i < 20; i++) {
      final state = ref.read(biometricProvider);
      if (!state.isChecking) break;
      await Future<void>.delayed(const Duration(milliseconds: 120));
      if (!mounted) return;
    }

    final biometric = ref.read(biometricProvider);
    if (biometric.isChecking) {
      // Sigue sin resolverse: no se marca nada, para poder ofrecerla en el
      // siguiente inicio de sesión en lugar de perder la oportunidad.
      return;
    }
    if (!biometric.canOfferActivation) {
      // Ya se sabe que el dispositivo no puede (sin lector o sin huellas): se
      // recuerda para no volver a comprobarlo.
      await notifier.markOffered();
      return;
    }

    _offeringBiometric = true;
    try {
      // Se espera un frame para que el destino del login ya esté montado.
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (!mounted) return;
      await notifier.markOffered();
      if (!mounted) return;

      final navigator = rootNavigatorKey.currentContext;
      debugPrint(
          '[OFERTA] mostrando nav=${navigator != null} mounted=${navigator?.mounted}');
      if (navigator == null || !navigator.mounted) return;
      await showBiometricEnableDialog(navigator, notifier);
    } catch (e) {
      debugPrint('[Biometría] no se pudo mostrar el aviso: $e');
    } finally {
      _offeringBiometric = false;
    }
  }

  Future<void> _forgotPassword() async {
    final controller = TextEditingController(text: _emailController.text);
    final email = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 8,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              'Recuperar contraseña',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(
              'Te enviaremos un enlace de restablecimiento al correo registrado.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Correo electrónico',
                prefixIcon: Icon(Icons.mail_outline_rounded),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(controller.text),
                child: const Text('Enviar enlace'),
              ),
            ),
          ],
        ),
      ),
    );

    if (email == null || email.isEmpty || !mounted) return;
    try {
      await ref.read(apiClientProvider).forgotPassword(email);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content:
              Text('Si el correo existe, recibirás el enlace en unos minutos.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('No pudimos enviar el enlace. Intenta luego.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final auth = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => context.go(AppRoutes.services),
          icon: const Icon(Icons.close_rounded),
          tooltip: 'Ver catálogo',
        ),
        title: const Text('Iniciar sesión'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const Center(
                  child: GhTopStripe(includeSafeArea: false, height: 4),
                ),
                const SizedBox(height: 22),
                const Center(child: GhLogoImage(height: 44)),
                const SizedBox(height: 20),
                Text(
                  'Bienvenido de vuelta',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  'Consulta el avance de tus trámites, documentos y pagos.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 28),
                // Aviso suave de la huella (sesión expirada, sin huellas…).
                const BiometricLoginNotice(),
                const BiometricLoginButton(),
                const SizedBox(height: 12),
                Row(
                  children: <Widget>[
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text(
                        'o ingrese con su contraseña',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 16),
                // El formulario se resalta cuando el usuario llega aquí pulsando
                // la huella sin tenerla vinculada.
                Container(
                  key: _formKeyField,
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _highlightForm
                          ? theme.colorScheme.primary
                          : Colors.transparent,
                      width: 2,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      if (_highlightForm) ...<Widget>[
                        GhInlineNotice(
                          message:
                              'Ingrese con su correo y contraseña para activar la '
                              'huella. Después podrá entrar solo con ella.',
                          title: 'Active la huella desde aquí',
                          color: GhTokens.info,
                          icon: Icons.fingerprint_rounded,
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const <String>[AutofillHints.email],
                        decoration: const InputDecoration(
                          labelText: 'Correo electrónico',
                          hintText: 'tucorreo@ejemplo.com',
                          prefixIcon: Icon(Icons.mail_outline_rounded),
                        ),
                        validator: GhValidators.email,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        autofillHints: const <String>[AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: 'Contraseña',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            tooltip: _obscure
                                ? 'Mostrar contraseña'
                                : 'Ocultar contraseña',
                          ),
                        ),
                        validator: (value) => GhValidators.password(value),
                      ),
                    ],
                  ),
                ),
                if (auth.error != null) ...<Widget>[
                  const SizedBox(height: 16),
                  GhInlineNotice(
                    message: auth.error!,
                    color: GhTokens.danger,
                    icon: Icons.error_outline_rounded,
                    title: 'No pudimos iniciar sesión',
                  ),
                ],
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _forgotPassword,
                    child: const Text('¿Olvidaste tu contraseña?'),
                  ),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: auth.isBusy ? null : _submit,
                  child: auth.isBusy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Iniciar sesión'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => context.push(AppRoutes.register),
                  icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                  label: const Text('Solicitar una cuenta'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.go(AppRoutes.services),
                  child: const Text('Explorar el catálogo sin cuenta'),
                ),
                if (AppConfig.useMocks) ...<Widget>[
                  const SizedBox(height: 20),
                  GhInlineNotice(
                    title: 'Modo demo activo',
                    message:
                        'Ingresa con cualquier correo y una contraseña de 6 o más '
                        'caracteres. Cuenta precargada: ${MockSeed.demoUser().email} '
                        '· ${MockSeed.demoPassword}',
                    color: GhTokens.warning,
                    icon: Icons.science_outlined,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
