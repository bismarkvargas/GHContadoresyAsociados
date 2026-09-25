import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/gh_tokens.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/validators.dart';

/// Formateador de número de tarjeta: agrupa en bloques de 4 dígitos.
class CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final buffer = StringBuffer();
    for (int i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Formateador de vencimiento MM/AA.
class ExpiryFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final limited = digits.length > 4 ? digits.substring(0, 4) : digits;
    final text = limited.length <= 2
        ? limited
        : '${limited.substring(0, 2)}/${limited.substring(2)}';
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Formateador de teléfono CR: +506 8888 8888.
class PhoneCrFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final local = digits.startsWith('506') ? digits.substring(3) : digits;
    final limited = local.length > 8 ? local.substring(0, 8) : local;
    final text = limited.length <= 4
        ? limited
        : '${limited.substring(0, 4)} ${limited.substring(4)}';
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Tarjeta visual con los datos que se van escribiendo (pasarela simulada).
class GhCardPreview extends StatelessWidget {
  const GhCardPreview({
    super.key,
    this.number = '',
    this.holder = '',
    this.expiry = '',
    this.brand,
  });

  final String number;
  final String holder;
  final String expiry;
  final String? brand;

  static String detectBrand(String digits) {
    if (digits.isEmpty) return 'Tarjeta';
    if (digits.startsWith('4')) return 'Visa';
    if (digits.startsWith('5') || digits.startsWith('2')) return 'Mastercard';
    if (digits.startsWith('3')) return 'American Express';
    if (digits.startsWith('6')) return 'Discover';
    return 'Tarjeta';
  }

  @override
  Widget build(BuildContext context) {
    final digits = number.replaceAll(RegExp(r'\D'), '');
    final display = StringBuffer();
    for (int i = 0; i < 16; i++) {
      if (i > 0 && i % 4 == 0) display.write(' ');
      display.write(i < digits.length ? digits[i] : '•');
    }
    final detected = brand ?? detectBrand(digits);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[GhTokens.primary, GhTokens.primary600],
        ),
        borderRadius: GhTokens.cardRadius,
        boxShadow: GhTokens.cardShadow(Brightness.light),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(Icons.credit_card_rounded, color: Colors.white70, size: 22),
              const Spacer(),
              Text(
                detected,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
          const SizedBox(height: 26),
          Text(
            display.toString(),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 19,
              letterSpacing: 2.2,
              fontWeight: FontWeight.w600,
              fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'TITULAR',
                      style: TextStyle(color: Colors.white54, fontSize: 10),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      holder.isEmpty ? 'NOMBRE APELLIDO' : holder.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  const Text(
                    'VENCE',
                    style: TextStyle(color: Colors.white54, fontSize: 10),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    expiry.isEmpty ? 'MM/AA' : expiry,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Indicador de pasos del checkout (datos → método → resultado).
class CheckoutStepper extends StatelessWidget {
  const CheckoutStepper({
    super.key,
    required this.current,
    this.steps = const <String>['Facturación', 'Pago', 'Resultado'],
  });

  final int current;
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: <Widget>[
          for (int i = 0; i < steps.length; i++) ...<Widget>[
            Column(
              children: <Widget>[
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: i <= current
                        ? GhTokens.primary
                        : theme.colorScheme.surfaceContainer,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: i < current
                      ? const Icon(Icons.check_rounded,
                          size: 15, color: Colors.white)
                      : Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: i <= current
                                ? Colors.white
                                : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                ),
                const SizedBox(height: 4),
                Text(
                  steps[i],
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    color: i <= current ? GhTokens.primary : null,
                    fontWeight: i == current ? FontWeight.w700 : null,
                  ),
                ),
              ],
            ),
            if (i != steps.length - 1)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.only(bottom: 18, left: 4, right: 4),
                  color: i < current
                      ? GhTokens.primary
                      : theme.colorScheme.outlineVariant,
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Animación de procesamiento del pago (tarjeta → spinner → resultado).
class ProcessingCard extends StatelessWidget {
  const ProcessingCard({
    super.key,
    required this.message,
    this.subtitle,
  });

  final String message;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            SizedBox(
              width: 96,
              height: 96,
              child: Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  SizedBox(
                    width: 96,
                    height: 96,
                    child: CircularProgressIndicator(
                      strokeWidth: 4,
                      backgroundColor: GhTokens.primary50,
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(GhTokens.primary),
                    ),
                  ),
                  const Icon(Icons.lock_outline_rounded,
                      size: 34, color: GhTokens.primary),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge,
            ),
            if (subtitle != null) ...<Widget>[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 24),
            Text(
              'No cierres la aplicación ni retrocedas.',
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

/// Icono circular de resultado (aprobado / rechazado / pendiente).
class ResultBadge extends StatelessWidget {
  const ResultBadge({
    super.key,
    required this.icon,
    required this.color,
    this.size = 96,
  });

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.7, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutBack,
      builder: (context, value, child) =>
          Transform.scale(scale: value, child: child),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          shape: BoxShape.circle,
          border: Border.all(color: color.withValues(alpha: 0.3), width: 2),
        ),
        child: Icon(icon, size: size * 0.46, color: color),
      ),
    );
  }
}

/// Formulario de tarjeta con formateo y validación Luhn.
class CardFormFields extends StatelessWidget {
  const CardFormFields({
    super.key,
    required this.numberController,
    required this.holderController,
    required this.expiryController,
    required this.cvvController,
    this.onChanged,
    this.showTestCards = true,
    this.onUseTestCard,
  });

  final TextEditingController numberController;
  final TextEditingController holderController;
  final TextEditingController expiryController;
  final TextEditingController cvvController;
  final VoidCallback? onChanged;
  final bool showTestCards;
  final void Function(String number)? onUseTestCard;

  static const List<({String number, String label, String result})> testCards =
      <({String number, String label, String result})>[
    (
      number: '4242424242424242',
      label: '4242 4242 4242 4242',
      result: 'Aprobado',
    ),
    (
      number: '4000000000000002',
      label: '4000 0000 0000 0002',
      result: 'Rechazado',
    ),
    (
      number: '4000000000009995',
      label: '4000 0000 0000 9995',
      result: 'Pendiente',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        TextFormField(
          controller: numberController,
          keyboardType: TextInputType.number,
          inputFormatters: <TextInputFormatter>[
            CardNumberFormatter(),
            LengthLimitingTextInputFormatter(19),
          ],
          onChanged: (_) => onChanged?.call(),
          decoration: const InputDecoration(
            labelText: 'Número de tarjeta *',
            hintText: '4242 4242 4242 4242',
            prefixIcon: Icon(Icons.credit_card_rounded),
          ),
          validator: GhValidators.cardNumber,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: holderController,
          textCapitalization: TextCapitalization.characters,
          onChanged: (_) => onChanged?.call(),
          decoration: const InputDecoration(
            labelText: 'Titular de la tarjeta *',
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
          validator: GhValidators.cardHolder,
        ),
        const SizedBox(height: 14),
        Row(
          children: <Widget>[
            Expanded(
              child: TextFormField(
                controller: expiryController,
                keyboardType: TextInputType.number,
                inputFormatters: <TextInputFormatter>[
                  ExpiryFormatter(),
                  LengthLimitingTextInputFormatter(5),
                ],
                onChanged: (_) => onChanged?.call(),
                decoration: const InputDecoration(
                  labelText: 'Vencimiento *',
                  hintText: 'MM/AA',
                ),
                validator: GhValidators.cardExpiry,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: cvvController,
                keyboardType: TextInputType.number,
                obscureText: true,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(4),
                ],
                decoration: const InputDecoration(
                  labelText: 'CVV *',
                  hintText: '123',
                ),
                validator: (value) => GhValidators.cardCvv(
                  value,
                  length: (value ?? '').length == 4 ? 4 : 3,
                ),
              ),
            ),
          ],
        ),
        if (showTestCards) ...<Widget>[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: GhTokens.warning.withValues(alpha: 0.08),
              borderRadius: GhTokens.controlRadius,
              border: Border.all(
                color: GhTokens.warning.withValues(alpha: 0.28),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    const Icon(Icons.science_outlined,
                        size: 16, color: GhTokens.warning),
                    const SizedBox(width: 6),
                    Text(
                      'Tarjetas de prueba de la pasarela simulada',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: GhTokens.warning,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                for (final card in testCards)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: InkWell(
                      onTap: onUseTestCard == null
                          ? null
                          : () => onUseTestCard!(card.number),
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: <Widget>[
                            Icon(
                              card.result == 'Aprobado'
                                  ? Icons.check_circle_outline_rounded
                                  : card.result == 'Rechazado'
                                      ? Icons.cancel_outlined
                                      : Icons.hourglass_empty_rounded,
                              size: 15,
                              color: card.result == 'Aprobado'
                                  ? GhTokens.success
                                  : card.result == 'Rechazado'
                                      ? GhTokens.danger
                                      : GhTokens.warning,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              card.label,
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontFeatures: const <FontFeature>[
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                            const Spacer(),
                            Text(
                              card.result,
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                Text(
                  'Toca una tarjeta para rellenar el formulario.',
                  style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Utilidad de redondeo monetario para evitar 0.30000000000000004.
double moneyRound(double value) => (value * 100).roundToDouble() / 100;

/// Redondeo a dos decimales con formato de moneda.
String money2(double value) => GhFormat.money(moneyRound(value));
