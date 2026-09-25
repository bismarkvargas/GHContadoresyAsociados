import 'package:flutter/material.dart';

/// Tokens de marca de GH Contadores y Asociados.
/// Fuente: docs/01-analisis-mercado.md §7 (extraídos del sitio en vivo).
class GhTokens {
  const GhTokens._();

  // ---- Colores de marca ----
  static const Color primary = Color(0xFFDF3131);
  static const Color primary600 = Color(0xFFC42121);
  static const Color primary50 = Color(0xFFFDECEC);
  static const Color ink = Color(0xFF212121);
  static const Color ink700 = Color(0xFF3A3A3A);
  static const Color muted = Color(0xFF646464);
  static const Color surface = Color(0xFFECEFF3);
  static const Color surface2 = Color(0xFFF7F8FA);
  static const Color border = Color(0xFFE2E5E9);
  static const Color success = Color(0xFF008250);
  static const Color warning = Color(0xFFD49341);
  static const Color danger = Color(0xFFE62214);
  static const Color info = Color(0xFF116DFF);

  // ---- Colores derivados para tema oscuro ----
  static const Color darkBackground = Color(0xFF16181B);
  static const Color darkSurface = Color(0xFF1E2126);
  static const Color darkSurface2 = Color(0xFF262A30);
  static const Color darkBorder = Color(0xFF343A42);

  // ---- Radios ----
  static const double radiusControl = 10;
  static const double radiusCard = 16;

  static BorderRadius get controlRadius =>
      BorderRadius.circular(radiusControl);
  static BorderRadius get cardRadius => BorderRadius.circular(radiusCard);

  // ---- Escala tipográfica (12/14/16/20/24/32) ----
  static const double fontCaption = 12;
  static const double fontBody = 14;
  static const double fontBodyLarge = 16;
  static const double fontTitle = 20;
  static const double fontHeadline = 24;
  static const double fontDisplay = 32;

  // ---- Espaciado ----
  static const double spaceXs = 4;
  static const double spaceSm = 8;
  static const double spaceMd = 16;
  static const double spaceLg = 24;
  static const double spaceXl = 32;

  /// Altura mínima táctil accesible (≥ 44 px, WCAG / HIG).
  static const double minTouchTarget = 44;

  /// Sombra suave única.
  static List<BoxShadow> softShadow(Brightness brightness) {
    if (brightness == Brightness.dark) {
      return const [
        BoxShadow(
          color: Color(0x33000000),
          blurRadius: 18,
          offset: Offset(0, 6),
        ),
      ];
    }
    return const [
      BoxShadow(
        color: Color(0x14000000),
        blurRadius: 18,
        offset: Offset(0, 6),
      ),
    ];
  }

  /// Sombra para tarjetas elevadas.
  static List<BoxShadow> cardShadow(Brightness brightness) => softShadow(brightness);

  /// Colores semánticos por estado de expediente / orden / tarea.
  static Color statusColor(String status) {
    switch (status) {
      case 'Open':
      case 'PendingPayment':
      case 'Todo':
      case 'Pending':
      case 'Initiated':
      case 'Lead':
      case 'New':
      case 'Queued':
        return info;
      case 'InProgress':
      case 'InProcess':
      case 'Contacted':
      case 'Sent':
        return warning;
      case 'WaitingClient':
      case 'OnHold':
      case 'Blocked':
        return warning;
      case 'Completed':
      case 'Closed':
      case 'Paid':
      case 'Done':
      case 'Approved':
      case 'Active':
      case 'Read':
        return success;
      case 'Cancelled':
      case 'Rejected':
      case 'Declined':
      case 'Failed':
      case 'Suspended':
      case 'Blocked_':
        return danger;
      case 'Refunded':
      case 'Discarded':
        return muted;
      default:
        return muted;
    }
  }
}
