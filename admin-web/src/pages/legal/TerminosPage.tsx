import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { company } from '@/lib/constants'
import { LegalPageShell, type LegalSection } from './LegalPageShell'
import { useDocumentMeta } from './useDocumentMeta'

/** Fecha de entrada en vigor del documento. Actualícela al publicar una versión nueva. */
const EN_VIGOR = '24 de septiembre de 2026'
/** Última revisión publicada. */
const ACTUALIZADO = '24 de septiembre de 2026'

const TITULO = 'Términos y Condiciones'
const DESCRIPCION =
  'Términos y Condiciones de uso de la aplicación y el panel de GH Contadores & Asociados: servicios, proceso de contratación y pago, trámites ante terceros, precios en dólares, cancelación y reembolsos, y ley aplicable en Costa Rica.'

const secciones: LegalSection[] = [
  { id: 'objeto', title: 'Qué regulan estos términos' },
  { id: 'servicio', title: 'Descripción del servicio' },
  { id: 'contratacion', title: 'Contratación de servicios y pagos' },
  {
    id: 'precios',
    title: 'Precios, impuestos y facturación',
    children: [{ id: 'pagos', title: 'Formas de pago' }],
  },
  { id: 'obligaciones', title: 'Obligaciones del cliente' },
  { id: 'tramites', title: 'Trámites ante terceros y plazos' },
  { id: 'cancelacion', title: 'Cancelación y reembolsos' },
  { id: 'documentos', title: 'Propiedad de los documentos' },
  { id: 'responsabilidad', title: 'Limitación de responsabilidad' },
  { id: 'modificaciones', title: 'Cambios en los servicios y en estos términos' },
  { id: 'ley', title: 'Ley aplicable y resolución de conflictos' },
]

/** Sección del documento. `sub` la convierte en subapartado (`<h3>`) de la anterior. */
function Seccion({
  id,
  title,
  sub = false,
  children,
}: {
  id: string
  title: string
  sub?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={sub ? 'gh-legal-subsection' : 'gh-legal-section'}
      aria-labelledby={`${id}-titulo`}
    >
      {sub ? <h3 id={`${id}-titulo`}>{title}</h3> : <h2 id={`${id}-titulo`}>{title}</h2>}
      {children}
    </section>
  )
}

export default function TerminosPage() {
  useDocumentMeta({ title: TITULO, description: DESCRIPCION })

  return (
    <LegalPageShell
      title={TITULO}
      eyebrow="Documento legal · Aplicación móvil y panel de administración"
      effectiveDate={EN_VIGOR}
      updatedAt={ACTUALIZADO}
      intro={`Estos términos rigen el uso de la aplicación móvil y del panel de administración de ${company.legalName} y la forma en que se contratan y se pagan los servicios profesionales de la firma. Léalos con calma: al crear una cuenta y utilizar la aplicación, usted acepta lo que aquí se explica. Si no está de acuerdo, no utilice la aplicación y contáctenos para atenderle por los canales habituales del despacho.`}
      sections={secciones}
    >
      <Seccion id="objeto" title="Qué regulan estos términos">
        <p>
          Estos términos son un acuerdo entre usted (en adelante, «el cliente») y{' '}
          <strong>{company.legalName}</strong> (en adelante, «la firma»), con domicilio en{' '}
          {company.address}. Regulan el uso de la aplicación móvil y del panel de administración y
          las condiciones generales bajo las cuales la firma presta sus servicios profesionales.
        </p>
        <p>
          El tratamiento de datos personales que hacemos a partir del uso de la aplicación se
          explica en la <Link to="/privacidad">Política de Privacidad</Link>, que forma parte de
          estos términos.
        </p>
        <p>
          Para contratar y usar la aplicación usted debe ser mayor de edad y tener capacidad legal
          para obligarse. Si actúa en nombre de una empresa o sociedad, declara que cuenta con
          facultades suficientes para representarla.
        </p>
      </Seccion>

      <Seccion id="servicio" title="Descripción del servicio">
        <p>
          La firma es una firma contable y legal que presta servicios profesionales de
          contabilidad, obligaciones tributarias, trámites legales, municipales y de inscripción
          ante entidades públicas. Los servicios concretos y su precio se detallan en la cotización
          y en el pedido que usted acepta.
        </p>
        <p>La aplicación y el panel le permiten, entre otras cosas:</p>
        <ul>
          <li>solicitar y contratar servicios y dar seguimiento a sus pedidos;</li>
          <li>crear y consultar su expediente y el estado de cada trámite;</li>
          <li>subir documentos y consultar los que la firma le entrega;</li>
          <li>recibir avisos sobre el avance del trámite y los vencimientos;</li>
          <li>comunicarse con el profesional asignado a su expediente;</li>
          <li>consultar y pagar los servicios contratados.</li>
        </ul>
        <p>
          <strong>La aplicación es una herramienta de gestión y comunicación, no un asesor
          automático.</strong> La información, plantillas o cálculos que aparezcan en ella no
          sustituyen el criterio profesional de la firma ni constituyen por sí solos una opinión
          legal, contable o tributaria. Los servicios profesionales se prestan con la intervención
          de las personas profesionales de la firma.
        </p>
        <p>
          La firma puede mejorar, ampliar o modificar las funciones de la aplicación y suspender
          temporalmente el servicio por mantenimiento, actualizaciones o causas ajenas a su
          control. Cuando la interrupción sea programada y relevante, se avisará por los canales
          habituales.
        </p>
      </Seccion>

      <Seccion id="contratacion" title="Contratación de servicios y pagos">
        <p>La contratación de un servicio sigue estos pasos:</p>
        <ol>
          <li>
            <strong>Solicitud y cotización:</strong> usted solicita el servicio desde la
            aplicación, el sitio web o el despacho. La firma le entrega una cotización con el
            alcance del trabajo, el precio en dólares de los Estados Unidos de América (USD) y el
            plazo estimado.
          </li>
          <li>
            <strong>Aceptación:</strong> usted acepta la cotización y, cuando el servicio lo
            requiera, crea su cuenta en la aplicación aportando datos verdaderos y actualizados.
          </li>
          <li>
            <strong>Pedido y expediente:</strong> al confirmarse el pedido, el sistema genera el
            expediente y se asigna un profesional responsable.
          </li>
          <li>
            <strong>Pago:</strong> salvo que la cotización indique otra cosa (por ejemplo, un
            anticipo o un pago fraccionado), el servicio se paga antes de iniciar el trabajo. Los
            servicios de tracto sucesivo, como la contabilidad mensual, se pagan por período.
          </li>
          <li>
            <strong>Ejecución y cierre:</strong> la firma realiza el trabajo, informa del avance por
            la aplicación y le entrega el resultado (declaraciones presentadas, inscripciones,
            estados financieros, constancias y demás documentos según el servicio).
          </li>
        </ol>
        <p>
          El pedido puede rechazarse o devolverse cuando falte información esencial, cuando los
          documentos aportados no sean legibles o no correspondan a lo solicitado, o cuando exista
          un conflicto de interés o una obligación legal que impida asumir el encargo. En ese caso
          se le explicará el motivo y no se cobrará el servicio no iniciado.
        </p>
      </Seccion>

      <Seccion id="precios" title="Precios, impuestos y facturación">
        <p>
          Los precios de los servicios y del catálogo se expresan en <strong>dólares de los Estados
          Unidos de América (USD)</strong>. Cuando se muestre un equivalente en colones (CRC) será
          informativo, calculado con el tipo de cambio que la firma tenga configurado en cada
          momento; el cobro se realiza en dólares salvo acuerdo escrito distinto.
        </p>
        <p>
          Los precios de la cotización tienen la vigencia que ella indique. Si transcurrido ese
          plazo usted no la acepta, la firma puede actualizarla.
        </p>
        <p>
          Salvo que la cotización indique lo contrario, el precio no incluye:
        </p>
        <ul>
          <li>
            los <strong>derechos, tasas, timbres y aranceles</strong> que cobran los entes públicos,
            las municipalidades, los notarios o los bancos por la tramitación;
          </li>
          <li>
            los <strong>gastos de terceros</strong> necesarios para el trámite (por ejemplo,
            traducciones, certificaciones, apostillado o transporte de documentos);
          </li>
          <li>los <strong>impuestos</strong> que resulten aplicables a la facturación.</li>
        </ul>
        <p>
          Cualquier monto de este tipo se le informará antes de incurrir en él y se facturará como
          concepto aparte.
        </p>

        <Seccion id="pagos" title="Formas de pago" sub>
          <p>
            El pago puede realizarse con tarjeta a través de la pasarela habilitada en la
            aplicación o en el sitio, o por los medios que la firma indique en la cotización o la
            factura (transferencia o depósito bancario). El cobro con tarjeta lo procesa la pasarela
            de pago correspondiente: la firma no almacena el número completo de la tarjeta.
          </p>
          <p>
            Cuando un pago sea rechazado o no pueda procesarse, se le avisará para que use otro
            medio; el trabajo se reanuda cuando el pago se acredita. La firma emite la factura a
            nombre de quien contrata; si necesita que la factura se emita a nombre de una sociedad u
            otra persona, indíquelo al contratar aportando los datos fiscales correctos.
          </p>
        </Seccion>
      </Seccion>

      <Seccion id="obligaciones" title="Obligaciones del cliente">
        <p>Usted se compromete a:</p>
        <ul>
          <li>
            <strong>Aportar información veraz, completa y actualizada</strong> y a{' '}
            <strong>presentar documentos legítimos y vigentes</strong>. No debe entregar documentos
            falsos, alterados ni de terceros sin autorización; hacerlo puede impedir la prestación
            del servicio y le hace responsable de las consecuencias legales.
          </li>
          <li>
            <strong>Responder con prontitud</strong> a las solicitudes de información o de
            documentos. Los plazos del trámite empiezan a contar, en la práctica, desde que se
            recibe la información completa.
          </li>
          <li>
            <strong>Mantener la confidencialidad de sus credenciales</strong> de acceso y no
            compartirlas. Las acciones realizadas con su usuario se entienden hechas por usted;
            avise de inmediato si sospecha un uso no autorizado.
          </li>
          <li>
            <strong>Usar la aplicación de forma lícita</strong>: no intentar acceder a expedientes
            o datos de otras personas, no interferir con el funcionamiento del servicio, no
            extraer información de forma automatizada ni usar la aplicación para fines distintos de
            los contratados.
          </li>
          <li>
            <strong>Respetar los derechos de la firma</strong> sobre la aplicación, su diseño, sus
            textos y sus marcas. La cuenta le da derecho a usar la aplicación, no a copiarla,
            modificarla ni redistribuirla.
          </li>
          <li>
            <strong>Pagar los servicios</strong> contratados en los plazos acordados.
          </li>
        </ul>
      </Seccion>

      <Seccion id="tramites" title="Trámites ante terceros y plazos">
        <p>
          Muchos de los servicios consisten en gestionar trámites ante terceros (SUGEF, ATV,
          CCSS, INS, MEIC, MAG, ICT, municipalidades, registros y otras entidades) o dependen de
          información emitida por ellos. Es importante que tenga claro lo siguiente:
        </p>
        <ul>
          <li>
            <strong>La firma presenta, gestiona y da seguimiento</strong> al trámite, pero{' '}
            <strong>la decisión la toma el ente</strong> y su criterio no puede garantizarse.
          </li>
          <li>
            <strong>Los plazos dependen del ente:</strong> los tiempos que figuran en la cotización
            o en la aplicación son estimaciones basadas en la experiencia de la firma y en la carga
            del ente en ese momento. Un retraso del ente, la exigencia de requisitos adicionales o
            un cambio de criterio no constituyen incumplimiento de la firma.
          </li>
          <li>
            <strong>Si el ente requiere información o documentos adicionales</strong>, se lo
            pediremos por la aplicación o por correo; si no los aporta dentro del plazo que el ente
            conceda, el trámite puede rechazarse o quedar archivado, y podría requerir una
            presentación nueva con su costo correspondiente.
          </li>
          <li>
            <strong>Las obligaciones periódicas</strong> (declaraciones, informes, pagos de
            planillas o tasas) tienen fechas límite legales. La firma recuerda los vencimientos por
            la aplicación, pero <strong>cumplir dentro del plazo es responsabilidad del
            cliente</strong>; los recargos, multas e intereses que se generen por un incumplimiento
            son por cuenta del cliente.
          </li>
          <li>
            Si la firma determina que el trámite no es viable por una causa legal o técnica, se lo
            comunicará y se acordará con usted la mejor alternativa o la devolución del monto
            previsto en la sección de cancelaciones.
          </li>
        </ul>
      </Seccion>

      <Seccion id="cancelacion" title="Cancelación y reembolsos">
        <p>
          Usted puede cancelar la contratación de un servicio en cualquier momento, escribiendo a{' '}
          <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a> o desde el
          despacho. La cancelación detiene los servicios que aún no se hayan iniciado.
        </p>
        <p>
          <strong>Reembolso del 100 %.</strong> Si el trabajo no se ha iniciado, se reembolsa la
          totalidad de lo pagado por ese servicio o, si lo prefiere, se le emite un crédito para
          otro servicio de la firma. También se reembolsa la totalidad cuando la firma no pueda
          asumir el encargo por un motivo que le sea atribuible.
        </p>
        <p>
          <strong>Reembolso proporcional.</strong> Si el trabajo ya está en curso, se reembolsa la
          parte que corresponda a las etapas no ejecutadas y al trabajo aún no realizado, una vez
          descontados:
        </p>
        <ul>
          <li>las horas profesionales ya invertidas y los entregables ya puestos a su disposición;</li>
          <li>
            los derechos, tasas y gastos de terceros ya pagados o comprometidos (por ejemplo,
            presentaciones ya realizadas, timbres, aranceles o certificaciones en trámite), que por
            su naturaleza no son recuperables;
          </li>
          <li>
            los costos de procesamiento de pago que la pasarela no reintegre, si existieran.
          </li>
        </ul>
        <p>
          <strong>Sin reembolso.</strong> No procede reembolso cuando el servicio ya fue prestado y
          entregado, cuando el trámite ya fue presentado ante el ente competente, ni cuando la
          imposibilidad de continuar se debe a información o documentos falsos, incompletos o
          aportados fuera de plazo por el cliente.
        </p>
        <p>
          <strong>La firma también puede terminar</strong> la relación profesional si el cliente
          incumple sus obligaciones, si aporta documentación falsa o si existen razones legales o
          de conflicto de interés que lo impidan; en ese caso se liquidará el trabajo realizado y se
          reembolsará lo que corresponda a lo no ejecutado.
        </p>
        <p>
          Los reembolsos se tramitan por el mismo medio de pago utilizado, en el plazo que la
          pasarela o el banco requieran para acreditarlo.
        </p>
      </Seccion>

      <Seccion id="documentos" title="Propiedad de los documentos">
        <p>
          Los documentos que usted sube a la aplicación (escrituras, cédulas, estados financieros,
          comprobantes y cualquier otro) siguen siendo suyos. Usted conserva la titularidad de su
          información y de sus originales.
        </p>
        <p>
          La firma le entrega los <strong>resultados del servicio</strong> contratado:
          declaraciones presentadas con sus acuses, inscripciones, constancias, estados
          financieros, escritos y demás entregables. Esos entregables son para su uso como cliente y
          quedan a su disposición en la aplicación mientras su cuenta esté activa.
        </p>
        <p>
          La firma conserva su propio <strong>expediente profesional</strong> (papeles de trabajo,
          respaldos y registros de lo actuado), que es su respaldo del trabajo realizado y se
          conserva por los plazos legales y contables aplicables, según se explica en la{' '}
          <Link to="/privacidad">Política de Privacidad</Link>.
        </p>
        <p>
          Le recomendamos descargar y conservar sus documentos y sus entregables. Cuando la relación
          termine, puede solicitar copia de su expediente escribiendo a{' '}
          <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a>; la firma entregará lo
          que la ley le permita entregar, conservando lo que esté obligada a mantener.
        </p>
      </Seccion>

      <Seccion id="responsabilidad" title="Limitación de responsabilidad">
        <p>
          La firma presta sus servicios con diligencia profesional y conforme a las normas técnicas
          y éticas de la profesión. En lo que la ley permita limitar:
        </p>
        <ul>
          <li>
            La firma <strong>no responde</strong> por decisiones, demoras, criterios o
            requerimientos de los entes públicos y terceros ante los que se tramita, ni por hechos
            fuera de su control razonable.
          </li>
          <li>
            La firma <strong>no responde</strong> por consecuencias derivadas de información o
            documentos inexactos, incompletos, desactualizados o aportados fuera de plazo por el
            cliente, ni por el uso que el cliente haga de la aplicación o de los entregables.
          </li>
          <li>
            Las estimaciones de plazos, cálculos de impuestos o proyecciones son estimaciones
            basadas en la información disponible en el momento y pueden variar si cambian los
            supuestos o la normativa.
          </li>
          <li>
            La aplicación se ofrece «tal como está»: aunque la firma procura mantenerla disponible
            y libre de errores, no garantiza que funcione sin interrupciones ni que los avisos
            lleguen en un plazo determinado, ya que dependen de la conexión a internet y de los
            servicios de notificación del dispositivo.
          </li>
          <li>
            Salvo dolo o culpa grave, y en la medida en que la ley lo permita, la responsabilidad
            total de la firma por los daños directos derivados de un servicio se limita al monto de
            honorarios efectivamente pagados por ese servicio.
          </li>
        </ul>
        <p>
          Nada de lo anterior excluye ni limita los derechos que la ley reconoce al consumidor, ni
          la responsabilidad de la firma cuando no pueda excluirse legalmente.
        </p>
      </Seccion>

      <Seccion id="modificaciones" title="Cambios en los servicios y en estos términos">
        <p>
          La firma puede actualizar estos términos para reflejar cambios en los servicios, en la
          aplicación o en la normativa. La versión vigente es siempre la publicada en esta
          dirección, con su fecha de última actualización al inicio.
        </p>
        <p>
          Los cambios que afecten de forma relevante a un servicio ya contratado se comunicarán por
          la aplicación o por correo antes de que empiecen a regir; si continúa usando el servicio
          después de esa fecha, se entenderán aceptados. Los cambios de precio no se aplican a los
          trabajos ya pagados ni a los períodos ya contratados.
        </p>
        <p>
          Un cambio en el alcance del trabajo solicitado por el cliente requiere una cotización
          nueva o complementaria; el precio y el plazo originales se refieren al trabajo descrito
          en la cotización aceptada.
        </p>
      </Seccion>

      <Seccion id="ley" title="Ley aplicable y resolución de conflictos">
        <p>
          Estos términos se rigen por las <strong>leyes de la República de Costa Rica</strong>.
        </p>
        <p>
          Antes de acudir a cualquier instancia, le pedimos que nos escriba a{' '}
          <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a> o llame al{' '}
          {company.phones[0]}: la mayoría de las diferencias se resuelven directamente con el
          profesional que atiende su expediente. Si no fuera posible, y salvo que la ley disponga
          otra cosa de forma imperativa (por ejemplo, en materia de consumo), las partes se
          someten a la jurisdicción de los tribunales competentes de Costa Rica.
        </p>
        <p>
          Para cualquier aviso relacionado con estos términos pueden usar los datos de contacto de
          la firma que figuran al final de esta página.
        </p>
      </Seccion>
    </LegalPageShell>
  )
}
