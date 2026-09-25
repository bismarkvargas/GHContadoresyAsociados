import 'dart:math';

import '../models/account_request.dart';
import '../models/cart.dart';
import '../models/case_file.dart';
import '../models/document.dart';
import '../models/message.dart';
import '../models/order.dart';
import '../models/user.dart';

/// Datos semilla del modo demo (2 expedientes, tareas, documentos,
/// pedidos, mensajes y notificaciones coherentes entre sí).
class MockSeed {
  const MockSeed._();

  static final Random _rng = Random(20260214);

  static DateTime _daysAgo(int days, {int hour = 9, int minute = 0}) {
    final now = DateTime.now().toUtc();
    return DateTime(now.year, now.month, now.day, hour, minute)
        .subtract(Duration(days: days));
  }

  static DateTime _daysAhead(int days, {int hour = 17}) {
    final now = DateTime.now().toUtc();
    return DateTime(now.year, now.month, now.day, hour, 0).add(Duration(days: days));
  }

  /// Cliente demo (persona física costarricense).
  static AppUser demoUser({bool active = true}) => AppUser(
        id: 'usr-demo-0001',
        fullName: 'María Fernanda Rodríguez Solano',
        email: 'maria.rodriguez@example.com',
        phone: '+506 8846 9454',
        idNumber: '1-1234-0567',
        status: active ? UserStatus.active : UserStatus.pending,
        clientId: 'cli-00001',
        clientType: ClientType.individual,
        companyName: 'Panadería La Espiga S.A.',
        address: '150 m norte del Banco Nacional, Huacas',
        province: 'Guanacaste',
        canton: 'Santa Cruz',
        district: 'Huacas',
        createdAt: _daysAgo(210),
      );

  /// Cliente pendiente de aprobación (para el flujo de espera).
  static AppUser pendingUser() => AppUser(
        id: 'usr-demo-0002',
        fullName: 'Carlos Andrés Jiménez Mora',
        email: 'carlos.jimenez@example.com',
        phone: '+506 2653 6634',
        idNumber: '3-101-778899',
        status: UserStatus.pending,
        clientId: 'cli-00002',
        clientType: ClientType.company,
        companyName: 'Inversiones del Pacífico CR S.A.',
        createdAt: _daysAgo(2),
      );

  static const String demoPassword = 'Demo1234';

  static const String demoClientCode = 'GH-CLI-00001';

  // ---------- Expedientes ----------

  static List<CaseFile> cases() => <CaseFile>[
        CaseFile(
          id: 'case-0001',
          code: 'GH-EXP-2026-0001',
          title: 'Declaración anual de renta 2025 — persona física',
          matter: 'Tributario',
          entity: 'ATV',
          status: 'InProgress',
          description:
              'Preparación y presentación de la declaración anual de renta (D-101) '
              'correspondiente al periodo 2025, incluye conciliación de ingresos, '
              'gastos deducibles y generación del formulario ante la ATV.',
          referenceNumber: 'D-101-2026-4471',
          priority: 'High',
          responsibleName: 'Gustavo Hernández (Contador)',
          openedAt: _daysAgo(21),
          dueAt: _daysAhead(9),
          agreedAmount: 232.00,
          progressPercent: 65,
          clientVisible: true,
          orderNumber: 'GH-ORD-2026-00003',
          tasksTotal: 5,
          tasksDone: 3,
          documentsCount: 4,
          unreadMessages: 1,
        ),
        CaseFile(
          id: 'case-0002',
          code: 'GH-EXP-2026-0002',
          title: 'Constitución de sociedad anónima S.A. + personería jurídica',
          matter: 'Legal',
          entity: 'MEIC',
          status: 'WaitingClient',
          description:
              'Constitución de sociedad anónima ante el Registro Nacional, '
              'elaboración de escritura, publicación en La Gaceta y obtención '
              'de la personería jurídica. Pendiente de firma del cliente.',
          referenceNumber: 'RN-2026-112398',
          priority: 'Normal',
          responsibleName: 'Lic. Karla Vega (Abogada)',
          openedAt: _daysAgo(12),
          dueAt: _daysAhead(18),
          agreedAmount: 685.00,
          progressPercent: 40,
          clientVisible: true,
          orderNumber: 'GH-ORD-2026-00007',
          tasksTotal: 6,
          tasksDone: 2,
          documentsCount: 5,
          unreadMessages: 2,
        ),
      ];

  static List<CaseTask> tasks() => <CaseTask>[
        CaseTask(
          id: 'task-0001',
          caseFileId: 'case-0001',
          title: 'Cargar constancia de salario del 2025',
          description:
              'Adjunta el PDF de la constancia de salario o certificación de ingresos '
              'emitida por tu patrono para completar la conciliación.',
          status: 'Todo',
          priority: 'High',
          dueAt: _daysAhead(3),
          assignedToName: 'Cliente',
          sortOrder: 1,
          clientActionable: true,
        ),
        CaseTask(
          id: 'task-0002',
          caseFileId: 'case-0001',
          title: 'Confirmar deducciones de gastos médicos',
          description: 'Revisa y confirma el detalle de gastos médicos deducibles.',
          status: 'Todo',
          priority: 'Normal',
          dueAt: _daysAhead(5),
          assignedToName: 'Cliente',
          sortOrder: 2,
          clientActionable: true,
        ),
        CaseTask(
          id: 'task-0003',
          caseFileId: 'case-0001',
          title: 'Conciliación bancaria de los 4 trimestres',
          status: 'Done',
          priority: 'Normal',
          dueAt: _daysAgo(6),
          completedAt: _daysAgo(5),
          assignedToName: 'Gustavo Hernández',
          sortOrder: 3,
        ),
        CaseTask(
          id: 'task-0004',
          caseFileId: 'case-0001',
          title: 'Generar formulario D-101 en plataforma ATV',
          status: 'InProgress',
          priority: 'High',
          dueAt: _daysAhead(6),
          assignedToName: 'Gustavo Hernández',
          sortOrder: 4,
        ),
        CaseTask(
          id: 'task-0005',
          caseFileId: 'case-0001',
          title: 'Cargar comprobantes de retención',
          status: 'Done',
          priority: 'Low',
          dueAt: _daysAgo(10),
          completedAt: _daysAgo(9),
          assignedToName: 'Cliente',
          sortOrder: 5,
        ),
        CaseTask(
          id: 'task-0006',
          caseFileId: 'case-0002',
          title: 'Firmar escritura de constitución',
          description:
              'La escritura está lista. Coordina la firma con la notaria para continuar '
              'con la publicación en La Gaceta.',
          status: 'Todo',
          priority: 'Urgent',
          dueAt: _daysAhead(2),
          assignedToName: 'Cliente',
          sortOrder: 1,
          clientActionable: true,
        ),
        CaseTask(
          id: 'task-0007',
          caseFileId: 'case-0002',
          title: 'Aportar cédula jurídica de socios',
          status: 'Todo',
          priority: 'High',
          dueAt: _daysAhead(4),
          assignedToName: 'Cliente',
          sortOrder: 2,
          clientActionable: true,
        ),
        CaseTask(
          id: 'task-0008',
          caseFileId: 'case-0002',
          title: 'Búsqueda registral de nombre',
          status: 'Done',
          priority: 'Normal',
          dueAt: _daysAgo(8),
          completedAt: _daysAgo(8),
          assignedToName: 'Lic. Karla Vega',
          sortOrder: 3,
        ),
        CaseTask(
          id: 'task-0009',
          caseFileId: 'case-0002',
          title: 'Elaborar borrador de estatutos',
          status: 'Done',
          priority: 'High',
          dueAt: _daysAgo(4),
          completedAt: _daysAgo(3),
          assignedToName: 'Lic. Karla Vega',
          sortOrder: 4,
        ),
        CaseTask(
          id: 'task-0010',
          caseFileId: 'case-0002',
          title: 'Publicación en La Gaceta',
          status: 'Blocked',
          priority: 'Normal',
          dueAt: _daysAhead(12),
          assignedToName: 'Lic. Karla Vega',
          sortOrder: 5,
        ),
        CaseTask(
          id: 'task-0011',
          caseFileId: 'case-0002',
          title: 'Inscripción ante CCSS como patrono',
          status: 'Todo',
          priority: 'Normal',
          dueAt: _daysAhead(20),
          assignedToName: 'Asistente',
          sortOrder: 6,
        ),
      ];

  static List<CaseEvent> timeline(String caseFileId) {
    if (caseFileId == 'case-0001') {
      return <CaseEvent>[
        CaseEvent(
          id: 'evt-1001',
          caseFileId: caseFileId,
          type: 'Created',
          title: 'Expediente creado',
          description: 'Se abrió el expediente a partir del pedido GH-ORD-2026-00003.',
          actorName: null,
          createdAt: _daysAgo(21, hour: 8, minute: 30),
        ),
        CaseEvent(
          id: 'evt-1002',
          caseFileId: caseFileId,
          type: 'Note',
          title: 'Profesional asignado',
          description: 'Gustavo Hernández (Contador) queda a cargo del expediente.',
          actorName: 'Administración GH',
          createdAt: _daysAgo(21, hour: 10),
        ),
        CaseEvent(
          id: 'evt-1003',
          caseFileId: caseFileId,
          type: 'TaskAdded',
          title: 'Solicitud de documentos',
          description: 'Se solicitaron 3 documentos para iniciar la conciliación.',
          actorName: 'Gustavo Hernández',
          createdAt: _daysAgo(19, hour: 9),
        ),
        CaseEvent(
          id: 'evt-1004',
          caseFileId: caseFileId,
          type: 'DocumentAdded',
          title: 'Documento recibido',
          description: 'El cliente subió «Estados de cuenta Banco Nacional 2025.pdf».',
          actorName: 'María Fernanda Rodríguez',
          createdAt: _daysAgo(15, hour: 15, minute: 12),
        ),
        CaseEvent(
          id: 'evt-1005',
          caseFileId: caseFileId,
          type: 'TaskCompleted',
          title: 'Conciliación bancaria completada',
          description: 'Se conciliaron los 4 trimestres del periodo 2025.',
          actorName: 'Gustavo Hernández',
          createdAt: _daysAgo(5, hour: 11, minute: 40),
        ),
        CaseEvent(
          id: 'evt-1006',
          caseFileId: caseFileId,
          type: 'StatusChanged',
          title: 'Estado: En proceso',
          description: 'Se inició la generación del formulario D-101 en la ATV.',
          actorName: 'Gustavo Hernández',
          createdAt: _daysAgo(4, hour: 9, minute: 5),
        ),
        CaseEvent(
          id: 'evt-1007',
          caseFileId: caseFileId,
          type: 'MessageAdded',
          title: 'Mensaje de la firma',
          description: 'Te solicitamos la constancia de salario para cerrar la conciliación.',
          actorName: 'Gustavo Hernández',
          createdAt: _daysAgo(1, hour: 16, minute: 20),
        ),
      ];
    }
    return <CaseEvent>[
      CaseEvent(
        id: 'evt-2001',
        caseFileId: caseFileId,
        type: 'Created',
        title: 'Expediente creado',
        description: 'Se abrió el expediente a partir del pedido GH-ORD-2026-00007.',
        actorName: null,
        createdAt: _daysAgo(12, hour: 9),
      ),
      CaseEvent(
        id: 'evt-2002',
        caseFileId: caseFileId,
        type: 'Note',
        title: 'Búsqueda registral aprobada',
        description: 'El nombre «Inversiones del Pacífico CR S.A.» está disponible.',
        actorName: 'Lic. Karla Vega',
        createdAt: _daysAgo(8, hour: 13),
      ),
      CaseEvent(
        id: 'evt-2003',
        caseFileId: caseFileId,
        type: 'TaskCompleted',
        title: 'Estatutos elaborados',
        description: 'Borrador de estatutos enviado para revisión del cliente.',
        actorName: 'Lic. Karla Vega',
        createdAt: _daysAgo(3, hour: 10, minute: 30),
      ),
      CaseEvent(
        id: 'evt-2004',
        caseFileId: caseFileId,
        type: 'StatusChanged',
        title: 'Estado: Esperando al cliente',
        description: 'Pendiente de firma de la escritura para continuar.',
        actorName: 'Lic. Karla Vega',
        createdAt: _daysAgo(2, hour: 11),
      ),
    ];
  }

  // ---------- Documentos ----------

  static List<DocumentItem> documents() => <DocumentItem>[
        DocumentItem(
          id: 'doc-0001',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          originalName: 'Estados de cuenta Banco Nacional 2025.pdf',
          category: 'Contable',
          contentType: 'application/pdf',
          sizeBytes: 1834500,
          uploadedByName: 'María Fernanda Rodríguez',
          uploadedAt: _daysAgo(15, hour: 15, minute: 12),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0002',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          originalName: 'Conciliación bancaria 2025 (borrador).pdf',
          category: 'Contable',
          contentType: 'application/pdf',
          sizeBytes: 642000,
          version: 2,
          uploadedByName: 'Gustavo Hernández',
          uploadedAt: _daysAgo(5, hour: 11, minute: 45),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0003',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          originalName: 'Comprobantes de retención 2025.pdf',
          category: 'Tributario',
          contentType: 'application/pdf',
          sizeBytes: 921300,
          uploadedByName: 'María Fernanda Rodríguez',
          uploadedAt: _daysAgo(9, hour: 18, minute: 2),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0004',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          originalName: 'Cédula de identidad (ambos lados).pdf',
          category: 'Identidad',
          contentType: 'application/pdf',
          sizeBytes: 388100,
          uploadedByName: 'María Fernanda Rodríguez',
          uploadedAt: _daysAgo(20, hour: 8, minute: 55),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0005',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          originalName: 'Borrador de estatutos sociales.pdf',
          category: 'Legal',
          contentType: 'application/pdf',
          sizeBytes: 512400,
          uploadedByName: 'Lic. Karla Vega',
          uploadedAt: _daysAgo(3, hour: 10, minute: 20),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0006',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          originalName: 'Certificación de personería de socios.pdf',
          category: 'Identidad',
          contentType: 'application/pdf',
          sizeBytes: 275800,
          uploadedByName: 'María Fernanda Rodríguez',
          uploadedAt: _daysAgo(10, hour: 12),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0007',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          originalName: 'Aprobación de nombre ante Registro Nacional.pdf',
          category: 'Legal',
          contentType: 'application/pdf',
          sizeBytes: 158900,
          uploadedByName: 'Lic. Karla Vega',
          uploadedAt: _daysAgo(8, hour: 13, minute: 10),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
        DocumentItem(
          id: 'doc-0008',
          caseFileId: null,
          caseCode: null,
          originalName: 'Recibo GH-ORD-2026-00003.pdf',
          category: 'Comprobante',
          contentType: 'application/pdf',
          sizeBytes: 98400,
          uploadedByName: 'Sistema GH',
          uploadedAt: _daysAgo(21, hour: 8, minute: 25),
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        ),
      ];

  // ---------- Mensajes ----------

  static List<Message> messages() => <Message>[
        Message(
          id: 'msg-0001',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          body: 'Buenos días María Fernanda. Ya iniciamos la conciliación bancaria '
              'del periodo 2025. Vamos a necesitar los comprobantes de retención.',
          isFromClient: false,
          senderName: 'Gustavo Hernández',
          readByClientAt: _daysAgo(19, hour: 16),
          createdAt: _daysAgo(19, hour: 9, minute: 20),
        ),
        Message(
          id: 'msg-0002',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          body: 'Con gusto, se los envío hoy mismo. ¿Necesitan algo más?',
          isFromClient: true,
          senderName: 'María Fernanda Rodríguez',
          readByStaffAt: _daysAgo(19, hour: 17),
          createdAt: _daysAgo(19, hour: 16, minute: 45),
        ),
        Message(
          id: 'msg-0003',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          body: 'Perfecto. Por ahora con eso avanzamos. Le aviso en cuanto esté '
              'listo el borrador del formulario D-101.',
          isFromClient: false,
          senderName: 'Gustavo Hernández',
          readByClientAt: _daysAgo(18, hour: 8),
          createdAt: _daysAgo(18, hour: 7, minute: 30),
        ),
        Message(
          id: 'msg-0004',
          caseFileId: 'case-0001',
          caseCode: 'GH-EXP-2026-0001',
          body: 'Te solicitamos la constancia de salario para cerrar la conciliación. '
              'Puedes subirla desde la sección Documentos del expediente.',
          isFromClient: false,
          senderName: 'Gustavo Hernández',
          createdAt: _daysAgo(1, hour: 16, minute: 20),
        ),
        Message(
          id: 'msg-0005',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          body: 'Buenas tardes. La búsqueda registral del nombre fue aprobada, '
              'el borrador de estatutos ya está listo para su revisión.',
          isFromClient: false,
          senderName: 'Lic. Karla Vega',
          readByClientAt: _daysAgo(8, hour: 14),
          createdAt: _daysAgo(8, hour: 13, minute: 15),
        ),
        Message(
          id: 'msg-0006',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          body: 'Excelente noticia. ¿Cuándo podríamos firmar la escritura?',
          isFromClient: true,
          senderName: 'María Fernanda Rodríguez',
          readByStaffAt: _daysAgo(7, hour: 9),
          createdAt: _daysAgo(7, hour: 8, minute: 40),
        ),
        Message(
          id: 'msg-0007',
          caseFileId: 'case-0002',
          caseCode: 'GH-EXP-2026-0002',
          body: 'Podemos coordinar la firma esta semana. Le comparto horarios '
              'disponibles y el detalle de honorarios notariales.',
          isFromClient: false,
          senderName: 'Lic. Karla Vega',
          createdAt: _daysAgo(2, hour: 11, minute: 5),
        ),
      ];

  // ---------- Órdenes ----------

  static List<Order> orders() => <Order>[
        Order(
          id: 'ord-0003',
          number: 'GH-ORD-2026-00003',
          status: 'Completed',
          items: <OrderItem>[
            OrderItem(
              id: 'oi-0001',
              productId: 'tramite-atv-declaracion-renta-anual',
              nameSnapshot: 'Declaración de Renta Anual (D-101)',
              unitPrice: 205.31,
              quantity: 1,
              total: 205.31,
              caseFileId: 'case-0001',
              caseCode: 'GH-EXP-2026-0001',
            ),
          ],
          totals: const CartTotals(
            subtotal: 205.31,
            discount: 0,
            tax: 26.69,
            total: 232.00,
          ),
          payment: PaymentResult(
            id: 'pay-0003',
            status: 'Approved',
            amount: 232.00,
            method: PaymentMethod.card,
            reference: 'GH-PAY-2026-000003',
            authorizationCode: 'AUTH-884213',
            cardBrand: 'Visa',
            cardLast4: '4242',
            cardHolder: 'MARIA F RODRIGUEZ',
            createdAt: _daysAgo(21, hour: 8, minute: 20),
            processedAt: _daysAgo(21, hour: 8, minute: 21),
          ),
          requiresInvoice: true,
          invoice: const InvoiceData(
            legalName: 'María Fernanda Rodríguez Solano',
            idNumber: '1-1234-0567',
            email: 'maria.rodriguez@example.com',
            phone: '+506 8846 9454',
            address: 'Huacas, Santa Cruz, Guanacaste',
          ),
          createdAt: _daysAgo(21, hour: 8, minute: 18),
          paidAt: _daysAgo(21, hour: 8, minute: 21),
          completedAt: _daysAgo(2),
          caseCodes: const <String>['GH-EXP-2026-0001'],
        ),
        Order(
          id: 'ord-0007',
          number: 'GH-ORD-2026-00007',
          status: 'InProcess',
          items: <OrderItem>[
            OrderItem(
              id: 'oi-0002',
              productId: 'constitucion-de-sociedad-anonima',
              nameSnapshot: 'Constitución de Sociedad Anónima',
              unitPrice: 606.19,
              quantity: 1,
              total: 606.19,
              caseFileId: 'case-0002',
              caseCode: 'GH-EXP-2026-0002',
            ),
          ],
          totals: const CartTotals(
            subtotal: 606.19,
            discount: 0,
            tax: 78.81,
            total: 685.00,
          ),
          payment: PaymentResult(
            id: 'pay-0007',
            status: 'Approved',
            amount: 685.00,
            method: PaymentMethod.sinpe,
            reference: 'GH-PAY-2026-000007',
            authorizationCode: 'SINPE-77120',
            createdAt: _daysAgo(12, hour: 8, minute: 50),
            processedAt: _daysAgo(12, hour: 8, minute: 52),
          ),
          notes: 'Facturar a nombre de Inversiones del Pacífico CR S.A.',
          requiresInvoice: true,
          invoice: const InvoiceData(
            legalName: 'Inversiones del Pacífico CR S.A.',
            idNumber: '3-101-778899',
            email: 'maria.rodriguez@example.com',
            phone: '+506 8846 9454',
          ),
          createdAt: _daysAgo(12, hour: 8, minute: 48),
          paidAt: _daysAgo(12, hour: 8, minute: 52),
          caseCodes: const <String>['GH-EXP-2026-0002'],
        ),
        Order(
          id: 'ord-0011',
          number: 'GH-ORD-2026-00011',
          status: 'PendingPayment',
          items: <OrderItem>[
            OrderItem(
              id: 'oi-0003',
              productId: 'tramite-municipal-patente-comercial',
              nameSnapshot: 'Trámite Municipal - Patente Comercial',
              unitPrice: 169.50,
              quantity: 1,
              total: 169.50,
            ),
          ],
          totals: const CartTotals(
            subtotal: 169.50,
            discount: 0,
            tax: 22.04,
            total: 191.54,
          ),
          requiresInvoice: false,
          createdAt: _daysAgo(3, hour: 14, minute: 5),
        ),
      ];

  // ---------- Solicitudes de cuenta ----------

  static List<AccountRequest> accountRequests() => <AccountRequest>[
        AccountRequest(
          id: 'ar-0001',
          fullName: 'Carlos Andrés Jiménez Mora',
          email: 'carlos.jimenez@example.com',
          phone: '+506 2653 6634',
          idNumber: '3-101-778899',
          clientType: ClientType.company,
          trackingCode: 'GH-SOL-0001',
          company: 'Inversiones del Pacífico CR S.A.',
          message: 'Necesitamos constituir una sociedad y llevar la contabilidad mensual.',
          status: 'Pending',
          createdAt: _daysAgo(2, hour: 10, minute: 15),
        ),
      ];

  /// Últimos dígitos que determinan el resultado de la pasarela simulada.
  static String outcomeForCard(String digits) {
    if (digits.endsWith('0002')) return 'Declined';
    if (digits.endsWith('9995')) return 'Pending';
    return 'Approved';
  }

  static String randomReference(String prefix) {
    final n = _rng.nextInt(900000) + 100000;
    return '$prefix-$n';
  }
}
