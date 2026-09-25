import 'package:intl/intl.dart';

import '../config/app_config.dart';

/// Formateo de dinero, fechas, porcentajes y textos de dominio.
class GhFormat {
  const GhFormat._();

  static final NumberFormat _usd = NumberFormat.currency(
    locale: 'en_US',
    symbol: r'$',
    decimalDigits: 2,
  );

  static final NumberFormat _crc = NumberFormat.currency(
    locale: 'es_CR',
    symbol: '₡',
    decimalDigits: 0,
  );

  static final NumberFormat _decimal = NumberFormat('#,##0.00', 'en_US');

  /// Precio en la moneda indicada (USD base, docs/02 §6).
  static String money(num amount, {String currency = 'USD'}) {
    if (currency.toUpperCase() == 'CRC') {
      return _crc.format(amount * AppConfig.usdToCrc);
    }
    return _usd.format(amount);
  }

  /// Equivalencia en colones (informativa en el carrito/checkout).
  static String moneyCrc(num amountUsd) => _crc.format(amountUsd * AppConfig.usdToCrc);

  static String decimal(num value) => _decimal.format(value);

  static String percent(num value) => '${value.round()}%';

  static String qty(int value) => NumberFormat.decimalPattern('es').format(value);

  /// `14 feb 2026, 10:30` — fecha UTC del contrato convertida a hora de CR.
  static String dateTime(DateTime? value) {
    if (value == null) return '—';
    final local = value.toLocal();
    return '${DateFormat('d MMM y', 'es').format(local)}, '
        '${DateFormat('HH:mm').format(local)}';
  }

  static String date(DateTime? value) {
    if (value == null) return '—';
    return DateFormat('d MMM y', 'es').format(value.toLocal());
  }

  static String dateLong(DateTime? value) {
    if (value == null) return '—';
    return DateFormat("d 'de' MMMM 'de' y", 'es').format(value.toLocal());
  }

  static String time(DateTime? value) {
    if (value == null) return '—';
    return DateFormat('HH:mm').format(value.toLocal());
  }

  /// Fecha relativa corta: «hace 3 h», «ayer», «12 mar 2026».
  static String relative(DateTime? value) {
    if (value == null) return '—';
    final now = DateTime.now();
    final diff = now.difference(value.toLocal());
    if (diff.inSeconds < 60) return 'hace un momento';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'hace ${diff.inHours} h';
    if (diff.inDays == 1) return 'ayer';
    if (diff.inDays < 7) return 'hace ${diff.inDays} días';
    return date(value);
  }

  /// Días restantes hasta un vencimiento (negativo = vencido).
  static int? daysUntil(DateTime? value) {
    if (value == null) return null;
    final now = DateTime.now();
    final target = value.toLocal();
    return DateTime(target.year, target.month, target.day)
        .difference(DateTime(now.year, now.month, now.day))
        .inDays;
  }

  /// Texto de vencimiento listo para mostrar.
  static String dueLabel(DateTime? value) {
    final days = daysUntil(value);
    if (days == null) return 'Sin vencimiento';
    if (days == 0) return 'Vence hoy';
    if (days == 1) return 'Vence mañana';
    if (days > 1) return 'Vence en $days días';
    return 'Vencido hace ${days.abs()} días';
  }

  /// Tamaño de archivo legible.
  static String fileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  /// Teléfono CR formateado: +506 2653 6634.
  static String phoneCr(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    final local = digits.startsWith('506') ? digits.substring(3) : digits;
    if (local.length == 8) {
      return '${AppConfig.crDialCode} ${local.substring(0, 4)} ${local.substring(4)}';
    }
    return raw;
  }

  /// Máscara de tarjeta: •••• •••• •••• 4242.
  static String cardMasked(String? brand, String? last4) {
    final label = (brand == null || brand.isEmpty) ? 'Tarjeta' : brand;
    return '$label •••• ${last4 ?? '••••'}';
  }

  /// Código de seguimiento legible.
  static String tracking(String code) => code.toUpperCase();
}
