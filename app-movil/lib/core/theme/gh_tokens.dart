import 'package:flutter/material.dart';

/// Tokens de marca de GH Contadores y Asociados.
///
/// Paleta corporativa: azul marino como color principal, **lima** como acento
/// (franja distintiva, indicador activo, badges con texto azul marino encima)
/// y semánticos de estado. El lima NUNCA se usa como texto sobre blanco.
class GhTokens {
  const GhTokens._();

  // ---- Colores de marca ----
  static const Color primary = Color(0xFF1E2B58);
  static const Color primary600 = Color(0xFF16214A);
  static const Color primary700 = Color(0xFF101838);
  static const Color primary50 = Color(0xFFEEF1F8);

  static const Color accent = Color(0xFFC4D82D);
  static const Color accent600 = Color(0xFFA8BC1F);
  static const Color accent50 = Color(0xFFF6FAE0);

  static const Color ink = Color(0xFF1E2B58);
  static const Color ink700 = Color(0xFF2A3B70);
  static const Color muted = Color(0xFF5A6785);
  static const Color surface = Color(0xFFF4F6FB);
  static const Color surface2 = Color(0xFFFAFBFD);
  static const Color border = Color(0xFFDCE2EE);

  static const Color success = Color(0xFF008250);
  static const Color warning = Color(0xFFD49341);
  static const Color danger = Color(0xFFC0392B);
  static const Color info = Color(0xFF2A6FDB);

  // ---- Colores derivados para tema oscuro ----
  static const Color darkBackground = Color(0xFF0D1327);
  static const Color darkSurface = Color(0xFF161F3D);
  static const Color darkSurface2 = Color(0xFF1E2950);
  static const Color darkBorder = Color(0xFF2E3A63);

  // ---- Marca: franja lima superior ----
  /// Grosor de la franja lima que corona la app (3,5 px).
  static const double topStripeHeight = 3.5;

  /// Altura total de la franja incluyendo el safe area del dispositivo.
  static double topStripeTotal(BuildContext context) =>
      topStripeHeight + MediaQuery.paddingOf(context).top;

  /// Alias del acento para el nombre del logotipo.
  static const Color lime = accent;

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

  /// Familia tipográfica corporativa.
  static const String fontFamily = 'Montserrat';

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
          color: Color(0x40000000),
          blurRadius: 18,
          offset: Offset(0, 6),
        ),
      ];
    }
    return const [
      BoxShadow(
        color: Color(0x14101838),
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
      default:
        return muted;
    }
  }
}
