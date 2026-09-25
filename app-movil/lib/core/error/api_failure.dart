import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';

/// Error de dominio normalizado (mapea `application/problem+json`, RFC 7807).
class ApiFailure implements Exception {
  const ApiFailure({
    required this.message,
    this.statusCode,
    this.code,
    this.traceId,
    this.errors = const <String, List<String>>{},
    this.isNetwork = false,
    this.isUnauthorized = false,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final String? traceId;
  final Map<String, List<String>> errors;
  final bool isNetwork;
  final bool isUnauthorized;

  factory ApiFailure.network([String? message]) => ApiFailure(
        message: message ??
            'No pudimos conectar con el servidor. Revisa tu conexión.',
        isNetwork: true,
      );

  factory ApiFailure.unauthorized([String? message]) => ApiFailure(
        message: message ?? 'Tu sesión expiró. Inicia sesión nuevamente.',
        statusCode: 401,
        isUnauthorized: true,
      );

  factory ApiFailure.unknown([Object? error]) => ApiFailure(
        message: 'Ocurrió un error inesperado${error == null ? '' : ': $error'}',
      );

  factory ApiFailure.fromDio(DioException e) {
    final int? status = e.response?.statusCode;
    final data = e.response?.data;

    Map<String, dynamic>? problem;
    if (data is Map<String, dynamic>) {
      problem = data;
    } else if (data is String && data.trim().startsWith('{')) {
      try {
        problem = jsonDecode(data) as Map<String, dynamic>;
      } catch (_) {
        problem = null;
      }
    } else if (data is List<int>) {
      try {
        final decoded = jsonDecode(utf8.decode(data));
        if (decoded is Map<String, dynamic>) problem = decoded;
      } catch (_) {
        problem = null;
      }
    }

    final Map<String, List<String>> fieldErrors = <String, List<String>>{};
    final rawErrors = problem?['errors'];
    if (rawErrors is Map) {
      rawErrors.forEach((key, value) {
        if (value is List) {
          fieldErrors[key.toString()] = value.map((e) => '$e').toList();
        } else if (value != null) {
          fieldErrors[key.toString()] = <String>['$value'];
        }
      });
    }

    final bool isTimeout = e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout;
    final bool isConnection = e.type == DioExceptionType.connectionError ||
        e.error is SocketException;

    if (isTimeout || isConnection) {
      return ApiFailure.network(
        isTimeout
            ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
            : null,
      );
    }

    final String message = (problem?['detail'] as String?) ??
        (problem?['title'] as String?) ??
        (problem?['message'] as String?) ??
        _fallbackMessage(status);

    return ApiFailure(
      message: message,
      statusCode: status,
      code: problem?['code']?.toString(),
      traceId: problem?['traceId']?.toString(),
      errors: fieldErrors,
      isUnauthorized: status == 401,
      isNetwork: status == null,
    );
  }

  static String _fallbackMessage(int? status) {
    switch (status) {
      case 400:
        return 'Revisa los datos enviados e inténtalo de nuevo.';
      case 401:
        return 'Tu sesión expiró. Inicia sesión nuevamente.';
      case 403:
        return 'No tienes permisos para realizar esta acción.';
      case 404:
        return 'No encontramos la información solicitada.';
      case 409:
        return 'La operación entra en conflicto con el estado actual.';
      case 422:
        return 'Los datos no son válidos.';
      case 429:
        return 'Demasiados intentos. Espera un momento.';
      case 500:
      case 502:
      case 503:
        return 'El servicio no está disponible en este momento.';
      default:
        return 'No pudimos completar la operación.';
    }
  }

  /// Primer error de validación disponible (para pintarlo bajo el campo).
  String? firstErrorFor(String field) {
    final list = errors[field];
    if (list == null || list.isEmpty) return null;
    return list.first;
  }

  @override
  String toString() => 'ApiFailure($statusCode): $message';
}
