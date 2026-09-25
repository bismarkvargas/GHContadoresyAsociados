import 'dart:async';

/// Utilidades de programación defensiva y asincronía.
class AsyncGuard {
  const AsyncGuard._();

  /// Ejecuta [action] con un tope de tiempo.
  static Future<T> timeout<T>(
    Future<T> action, {
    Duration limit = const Duration(seconds: 20),
    T? fallback,
  }) async {
    try {
      return await action.timeout(limit);
    } on TimeoutException {
      if (fallback != null) return fallback;
      rethrow;
    }
  }

  /// Espera a que [check] sea verdadero o expira (para arranques tolerantes).
  static Future<bool> waitUntil(
    Future<bool> Function() check, {
    Duration timeout = const Duration(seconds: 10),
    Duration interval = const Duration(milliseconds: 250),
  }) async {
    final DateTime deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      if (await check()) return true;
      await Future<void>.delayed(interval);
    }
    return false;
  }

  /// Reintenta [action] con backoff exponencial.
  static Future<T> retry<T>(
    Future<T> Function() action, {
    int attempts = 3,
    Duration initialDelay = const Duration(milliseconds: 400),
    bool Function(Object error)? shouldRetry,
  }) async {
    Duration delay = initialDelay;
    Object? lastError;
    for (int i = 0; i < attempts; i++) {
      try {
        return await action();
      } catch (e) {
        lastError = e;
        if (shouldRetry != null && !shouldRetry(e)) rethrow;
        if (i == attempts - 1) rethrow;
        await Future<void>.delayed(delay);
        delay *= 2;
      }
    }
    throw lastError!;
  }
}

/// Debouncer simple para el buscador del catálogo.
class Debouncer {
  Debouncer({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;
  Timer? _timer;

  void run(void Function() action) {
    _timer?.cancel();
    _timer = Timer(delay, action);
  }

  void dispose() => _timer?.cancel();
}
