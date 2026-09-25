import '../config/app_config.dart';

/// Validaciones de formularios (Costa Rica).
class GhValidators {
  const GhValidators._();

  static final RegExp _email = RegExp(
    r'^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$',
  );

  static String? required(String? value, {String field = 'Este campo'}) {
    if (value == null || value.trim().isEmpty) return '$field es obligatorio';
    return null;
  }

  static String? fullName(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa tu nombre completo';
    final parts = value.trim().split(RegExp(r'\s+'));
    if (parts.length < 2) return 'Ingresa nombre y apellidos';
    if (value.trim().length < 5) return 'El nombre es demasiado corto';
    return null;
  }

  static String? email(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa tu correo electrónico';
    if (!_email.hasMatch(value.trim())) return 'El correo no tiene un formato válido';
    return null;
  }

  /// Teléfono de Costa Rica: 8 dígitos, opcionalmente con +506.
  static String? phoneCr(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa tu teléfono';
    final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
    final local = digits.startsWith('506') ? digits.substring(3) : digits;
    if (local.length != 8) return 'El teléfono debe tener 8 dígitos (CR)';
    if (!RegExp(r'^[2-8]').hasMatch(local)) {
      return 'El teléfono debe iniciar entre 2 y 8';
    }
    return null;
  }

  /// Cédula / NIT / pasaporte.
  /// Persona física: 9 dígitos · Persona jurídica: 10 dígitos · Extranjero: alfanumérico ≥ 6.
  static String? idNumber(String? value, {String clientType = 'Individual'}) {
    if (value == null || value.trim().isEmpty) return 'Ingresa la cédula o NIT';
    final clean = value.replaceAll(RegExp(r'[\s-]'), '');
    if (clientType == 'ForeignInvestor') {
      if (clean.length < 6) return 'El documento debe tener al menos 6 caracteres';
      return null;
    }
    if (clientType == 'Company') {
      if (!RegExp(r'^\d{10}$').hasMatch(clean)) {
        return 'La cédula jurídica debe tener 10 dígitos';
      }
      return null;
    }
    if (!RegExp(r'^\d{9}$').hasMatch(clean)) {
      return 'La cédula física debe tener 9 dígitos';
    }
    return null;
  }

  static String? password(String? value, {bool isNew = false}) {
    if (value == null || value.isEmpty) return 'Ingresa la contraseña';
    if (isNew) {
      if (value.length < 8) return 'Debe tener al menos 8 caracteres';
      if (!RegExp(r'[A-Za-z]').hasMatch(value) || !RegExp(r'\d').hasMatch(value)) {
        return 'Debe combinar letras y números';
      }
    }
    return null;
  }

  static String? confirmPassword(String? value, String original) {
    if (value == null || value.isEmpty) return 'Confirma la contraseña';
    if (value != original) return 'Las contraseñas no coinciden';
    return null;
  }

  static String? message(String? value, {int min = 10}) {
    if (value == null || value.trim().isEmpty) return 'Escribe un mensaje';
    if (value.trim().length < min) return 'Escribe al menos $min caracteres';
    return null;
  }

  // ---------- Tarjetas (pasarela simulada) ----------

  /// Algoritmo de Luhn.
  static bool luhn(String number) {
    final digits = number.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 12 || digits.length > 19) return false;
    int sum = 0;
    bool alternate = false;
    for (int i = digits.length - 1; i >= 0; i--) {
      int n = int.parse(digits[i]);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 == 0;
  }

  static String? cardNumber(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa el número de tarjeta';
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 15 || digits.length > 16) {
      return 'El número debe tener 15 o 16 dígitos';
    }
    if (!luhn(digits)) return 'El número de tarjeta no es válido';
    return null;
  }

  static String? cardExpiry(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa el vencimiento';
    final m = RegExp(r'^(\d{2})\s*/\s*(\d{2})$').firstMatch(value.trim());
    if (m == null) return 'Usa el formato MM/AA';
    final month = int.parse(m.group(1)!);
    final year = 2000 + int.parse(m.group(2)!);
    if (month < 1 || month > 12) return 'Mes inválido';
    final now = DateTime.now();
    final expiry = DateTime(year, month + 1, 0);
    if (expiry.isBefore(DateTime(now.year, now.month, 1))) return 'La tarjeta está vencida';
    return null;
  }

  static String? cardCvv(String? value, {int length = 3}) {
    if (value == null || value.trim().isEmpty) return 'Ingresa el CVV';
    if (!RegExp('^\\d{$length}\$').hasMatch(value.trim())) {
      return 'El CVV debe tener $length dígitos';
    }
    return null;
  }

  static String? cardHolder(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa el nombre del titular';
    if (value.trim().length < 5) return 'Nombre del titular demasiado corto';
    return null;
  }

  static String? sinpePhone(String? value) => phoneCr(value);

  static String? transferReference(String? value) {
    if (value == null || value.trim().isEmpty) return 'Ingresa el número de referencia';
    if (value.trim().length < 5) return 'La referencia debe tener al menos 5 caracteres';
    return null;
  }

  /// Tipo MIME permitido para documentos (docs/02 §5).
  static const List<String> allowedMimeTypes = <String>[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  static const List<String> allowedExtensions = <String>[
    'pdf',
    'png',
    'jpg',
    'jpeg',
    'doc',
    'docx',
    'xlsx',
  ];

  static String? uploadFile({required String name, required int bytes}) {
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    if (!allowedExtensions.contains(ext)) {
      return 'Formato no permitido. Usa PDF, PNG, JPG, DOC(X) o XLSX.';
    }
    if (bytes <= 0) return 'El archivo está vacío.';
    if (bytes > AppConfig.maxUploadBytes) {
      return 'El archivo supera los ${AppConfig.maxUploadBytes ~/ (1024 * 1024)} MB.';
    }
    return null;
  }
}
