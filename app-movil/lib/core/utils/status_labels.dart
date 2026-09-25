import 'package:flutter/material.dart';

/// Etiquetas en español y colores por estado (docs/03 §7).
class GhStatus {
  const GhStatus._();

  static const Color _info = Color(0xFF116DFF);
  static const Color _warning = Color(0xFFD49341);
  static const Color _success = Color(0xFF008250);
  static const Color _danger = Color(0xFFE62214);
  static const Color _muted = Color(0xFF646464);

  static const Map<String, String> _labels = <String, String>{
    // User
    'Pending': 'Pendiente',
    'Active': 'Activo',
    'Suspended': 'Suspendido',
    'Rejected': 'Rechazado',
    // AccountRequest
    'Approved': 'Aprobado',
    'Cancelled': 'Cancelado',
    // Client
    'Lead': 'Prospecto',
    'Inactive': 'Inactivo',
    'Blocked': 'Bloqueado',
    // CaseFile
    'Open': 'Abierto',
    'InProgress': 'En proceso',
    'WaitingClient': 'Esperando al cliente',
    'OnHold': 'En pausa',
    'Completed': 'Completado',
    'Closed': 'Cerrado',
    // CaseTask
    'Todo': 'Por hacer',
    'Done': 'Completada',
    'BlockedTask': 'Bloqueada',
    // Order
    'PendingPayment': 'Pendiente de pago',
    'Paid': 'Pagada',
    'InProcess': 'En proceso',
    'Refunded': 'Reembolsada',
    // Payment
    'Initiated': 'Iniciado',
    'Declined': 'Rechazado',
    'Failed': 'Falló',
    // Quote
    'New': 'Nueva',
    'Contacted': 'Contactado',
    'Quoted': 'Cotizado',
    'Converted': 'Convertido',
    'Discarded': 'Descartado',
    // Notification
    'Queued': 'En cola',
    'Sent': 'Enviada',
    'Read': 'Leída',
    // Priority
    'Low': 'Baja',
    'Normal': 'Normal',
    'High': 'Alta',
    'Urgent': 'Urgente',
  };

  static String label(String status) => _labels[status] ?? status;

  static Color color(String status) {
    switch (status) {
      case 'Open':
      case 'PendingPayment':
      case 'Todo':
      case 'Pending':
      case 'Initiated':
      case 'Lead':
      case 'New':
      case 'Queued':
        return _info;
      case 'InProgress':
      case 'InProcess':
      case 'WaitingClient':
      case 'OnHold':
      case 'Contacted':
      case 'Sent':
      case 'BlockedTask':
        return _warning;
      case 'Completed':
      case 'Closed':
      case 'Paid':
      case 'Done':
      case 'Approved':
      case 'Active':
      case 'Read':
      case 'Converted':
        return _success;
      case 'Cancelled':
      case 'Rejected':
      case 'Declined':
      case 'Failed':
      case 'Suspended':
      case 'Blocked':
        return _danger;
      default:
        return _muted;
    }
  }

  static Color softColor(String status) =>
      color(status).withValues(alpha: 0.12);

  /// Etiquetas de materia del expediente.
  static const List<String> matters = <String>[
    'Contable',
    'Tributario',
    'Legal',
    'Municipal',
    'Laboral',
    'Otro',
  ];

  /// Entes reguladores reales (docs/01 §2).
  static const List<String> entities = <String>[
    'SUGEF',
    'ACAM',
    'ATV',
    'CCSS',
    'INS',
    'MEIC',
    'MAG',
    'ICT',
    'RTBF',
    'Ministerio de Salud',
    'Municipalidad',
    'Otro',
  ];

  static const Map<String, IconData> matterIcons = <String, IconData>{
    'Contable': Icons.calculate_outlined,
    'Tributario': Icons.receipt_long_outlined,
    'Legal': Icons.gavel_outlined,
    'Municipal': Icons.location_city_outlined,
    'Laboral': Icons.groups_outlined,
    'Otro': Icons.folder_outlined,
  };
}
