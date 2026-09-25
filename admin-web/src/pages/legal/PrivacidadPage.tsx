import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { company } from '@/lib/constants'
import { LegalPageShell, type LegalSection } from './LegalPageShell'
import { useDocumentMeta } from './useDocumentMeta'

/** Fecha de entrada en vigor del documento. Actualícela al publicar una versión nueva. */
const EN_VIGOR = '24 de septiembre de 2026'
/** Última revisión publicada. */
const ACTUALIZADO = '24 de septiembre de 2026'

const TITULO = 'Política de Privacidad'
const DESCRIPCION =
  'Política de Privacidad de la aplicación y el panel de GH Contadores & Asociados: qué datos personales tratamos, para qué, con quién se comparten, cuánto se conservan y cómo ejercer sus derechos.'

/**
 * Índice y cuerpo del documento. El orden de esta lista es el orden del índice y de
 * las secciones: cada `id` debe existir como `<section id="…">` en el cuerpo.
 */
const secciones: LegalSection[] = [
  { id: 'responsable', title: 'Quién trata sus datos' },
  { id: 'datos', title: 'Qué datos recogemos' },
  { id: 'finalidades', title: 'Para qué usamos los datos' },
  {
    id: 'base-legal',
    title: 'Base legal y tiempo de conservación',
    children: [{ id: 'conservacion', title: 'Cuánto tiempo conservamos cada dato' }],
  },
  { id: 'comunicaciones', title: 'Con quién se comparten' },
  { id: 'seguridad', title: 'Cómo protegemos la información' },
  {
    id: 'derechos',
    title: 'Sus derechos y cómo ejercerlos',
    children: [{ id: 'eliminacion', title: 'Eliminación de la cuenta y de los datos' }],
  },
  { id: 'menores', title: 'Menores de edad' },
  { id: 'cambios', title: 'Cambios en esta política' },
  { id: 'contacto', title: 'Cómo contactarnos' },
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

export default function PrivacidadPage() {
  useDocumentMeta({ title: TITULO, description: DESCRIPCION })

  return (
    <LegalPageShell
      title={TITULO}
      eyebrow="Documento legal · Aplicación móvil y panel de administración"
      effectiveDate={EN_VIGOR}
      updatedAt={ACTUALIZADO}
      intro={`Esta política explica, en lenguaje sencillo, qué datos personales trata ${company.legalName} cuando usted usa nuestra aplicación móvil o nuestro panel de administración, con qué finalidad, con quién se comparten y qué puede hacer para controlarlos. Aplica al uso de la aplicación y a los servicios profesionales que la firma presta desde su despacho en Costa Rica.`}
      sections={secciones}
    >
      <Seccion id="responsable" title="Quién trata sus datos">
        <p>
          El responsable del tratamiento de los datos personales es{' '}
          <strong>{company.legalName}</strong>, firma contable y legal con domicilio en{' '}
          {company.address}. Los canales oficiales de contacto son el correo{' '}
          <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a>, el correo{' '}
          <a href={`mailto:${company.emailManagement}`}>{company.emailManagement}</a> y los
          teléfonos {company.phones.join(' y ')}, en horario de atención de Costa Rica (zona horaria{' '}
          {company.timeZone}).
        </p>
        <p>
          «La aplicación» se refiere tanto a la aplicación móvil que el cliente instala en su
          teléfono como al panel de administración que usa el personal de la firma. «Nosotros» y «la
          firma» se refieren a {company.legalName}.
        </p>
      </Seccion>

      <Seccion id="datos" title="Qué datos recogemos">
        <p>
          Recogemos únicamente la información necesaria para prestar el servicio profesional
          contratado y para cumplir las obligaciones legales y contables que le corresponden a la
          firma. En concreto:
        </p>
        <ul>
          <li>
            <strong>Datos de identificación y contacto:</strong> nombre completo, correo
            electrónico, teléfono, cédula o identificación fiscal, empresa o actividad a la que se
            refiere el trámite y dirección.
          </li>
          <li>
            <strong>Datos del expediente:</strong> el contenido que usted nos aporta para el
            trámite (por ejemplo, datos de la sociedad, ingresos y gastos, información laboral o
            tributaria) y los <strong>documentos que sube a su expediente</strong>, que pueden ser
            archivos PDF o imágenes. Cuando un documento contiene datos de terceros, usted es
            responsable de aportarlo con autorización de esas personas.
          </li>
          <li>
            <strong>Datos de uso y técnicos:</strong> registros de acceso e inicio de sesión,
            acciones realizadas en la aplicación y en el panel, fecha y hora, y datos técnicos del
            dispositivo (tipo de dispositivo y de sistema, versión de la aplicación) junto con los
            tokens de notificación del dispositivo que permiten enviarle avisos.
          </li>
          <li>
            <strong>Datos de facturación y pago:</strong> identificación del servicio facturado,
            importe y estado del pago. La firma <strong>no almacena el número completo de su
            tarjeta</strong>: el cobro lo procesa la pasarela de pago correspondiente, que recibe
            los datos necesarios para autorizar la transacción.
          </li>
          <li>
            <strong>Contraseñas:</strong> se guardan cifradas (con una función de derivación con
            sal, nunca en texto legible); nadie en la firma puede ver su contraseña.
          </li>
        </ul>
        <p>
          No solicitamos datos que no sean relevantes para el servicio. La aplicación no recoge
          datos de geolocalización, no accede a sus contactos ni escanea su dispositivo en busca de
          otros archivos, y no consulta el contenido de su teléfono.
        </p>
      </Seccion>

      <Seccion id="finalidades" title="Para qué usamos los datos">
        <p>Usamos sus datos personales para estas finalidades:</p>
        <ul>
          <li>
            <strong>Prestar el servicio profesional contratado</strong> y ejecutar los trámites que
            nos encarga la firma.
          </li>
          <li>
            <strong>Gestionar su expediente</strong> y los trámites que se presentan ante
            entidades y entes reguladores cuando el servicio lo exige, entre ellos SUGEF, ATV
            (Dirección General de Tributación), CCSS, INS, MEIC, MAG, ICT y las municipalidades
            correspondientes.
          </li>
          <li>
            <strong>Emitir facturas y gestionar cobros</strong> y la contabilidad de la firma.
          </li>
          <li>
            <strong>Comunicarnos con usted</strong>: avisos sobre el avance del trámite,
            requerimientos de información o de documentos, vencimientos y respuesta a sus
            consultas.
          </li>
          <li>
            <strong>Dar soporte técnico</strong>: atender fallos, dudas de uso o incidencias de su
            cuenta y de la aplicación.
          </li>
          <li>
            <strong>Seguridad y control de acceso</strong>: verificar su identidad, registrar
            quién hace qué en el sistema y prevenir usos indebidos.
          </li>
          <li>
            <strong>Mejorar el servicio</strong> a partir de datos de uso agregados y de
            incidencias reportadas.
          </li>
        </ul>
        <p>
          <strong>No usamos sus datos para venderlos, alquilarlos ni cederlos</strong> con fines
          publicitarios o de mercadeo de terceros, y no elaboramos perfiles comerciales con ellos.
        </p>
      </Seccion>

      <Seccion id="base-legal" title="Base legal y tiempo de conservación">
        <p>
          Tratamos sus datos porque son necesarios para ejecutar el contrato de servicios
          profesionales que usted nos encarga, porque usted consiente el uso de la aplicación
          móvil al crear su cuenta y, en varios casos, porque la firma debe cumplir obligaciones
          legales y contables en Costa Rica. El sistema de archivo de la firma es un sistema de
          información diseñado para la gestión de expedientes y el cumplimiento normativo.
        </p>
        <Seccion id="conservacion" title="Cuánto tiempo conservamos cada dato" sub>
          <p>Cada dato se conserva solo durante el tiempo que resulta necesario:</p>
          <ul>
            <li>
              <strong>Datos de identificación y fiscales:</strong> mientras exista la relación
              profesional y, después, durante los plazos legales y contables aplicables en Costa
              Rica.
            </li>
            <li>
              <strong>Documentos y registros de contabilidad:</strong> mientras exista la relación
              profesional y, después, por los plazos legales de conservación contable y tributaria,
              incluida la documentación que respalda una obligación ante la administración
              tributaria.
            </li>
            <li>
              <strong>Otros datos del expediente</strong> (comunicaciones, seguimiento de tareas,
              interacciones): mientras exista la relación profesional y, luego, el tiempo necesario
              para atender una posible reclamación, con un máximo de cinco años salvo que una norma
              exija conservarlos más.
            </li>
            <li>
              <strong>Registros técnicos y de auditoría</strong> (accesos, altas y bajas de
              documentos, descargas): doce meses como máximo, salvo que deban conservarse para
              acreditar el cumplimiento de una obligación legal.
            </li>
            <li>
              <strong>Tokens de notificación del dispositivo:</strong> mientras la cuenta esté
              activa y la aplicación instalada; se eliminan al cerrar sesión de forma definitiva o
              al eliminar la cuenta.
            </li>
          </ul>
          <p>
            Cuando termina la relación profesional, la firma puede conservar el expediente y la
            documentación asociada durante los plazos anteriores y bloquear su tratamiento para
            cualquier finalidad distinta de acreditar el trabajo realizado o cumplir una obligación
            legal.
          </p>
        </Seccion>
      </Seccion>

      <Seccion id="comunicaciones" title="Con quién se comparten">
        <p>Sus datos se comparten únicamente con:</p>
        <ul>
          <li>
            <strong>El personal de la firma</strong> que atiende su expediente, con acceso limitado
            según su rol y sus permisos.
          </li>
          <li>
            <strong>Los entes y entidades ante los que se tramita</strong> (por ejemplo SUGEF, ATV
            o la municipalidad correspondiente) y, en general, <strong>cuando usted lo
            autoriza</strong> por escrito o de forma electrónica.
          </li>
          <li>
            <strong>Proveedores tecnológicos necesarios</strong> para operar el servicio: el
            proveedor de alojamiento de la aplicación y de la base de datos, el proveedor de envío
            de correos y notificaciones y la pasarela de pago que procesa los cobros con
            tarjeta. Estos proveedores tratan los datos <strong>solo por cuenta de la firma y
            siguiendo sus instrucciones</strong>, y están obligados a mantener la
            confidencialidad.
          </li>
          <li>
            <strong>Autoridades competentes</strong> cuando exista una obligación legal, una
            orden judicial o un requerimiento de una autoridad con competencia para pedirlo.
          </li>
        </ul>
        <p>
          <strong>No se venden datos personales</strong> ni se ceden a terceros con fines
          publicitarios. Tampoco se transferieren a países que no ofrezcan un nivel de protección
          adecuado sin las garantías contractuales que exige la normativa costarricense de
          protección de datos personales.
        </p>
      </Seccion>

      <Seccion id="seguridad" title="Cómo protegemos la información">
        <p>Aplicamos medidas técnicas y organizativas proporcionadas al riesgo, entre ellas:</p>
        <ul>
          <li>
            <strong>Acceso con credenciales propias</strong> para cada persona usuaria, con
            permisos por rol (un abogado, un contador y un asistente no ven lo mismo) y sin cuentas
            compartidas.
          </li>
          <li>
            <strong>Contraseñas cifradas</strong> con una función de derivación con sal. Ni el
            personal de la firma ni nadie con acceso a la base de datos puede leer la contraseña
            original.
          </li>
          <li>
            <strong>Descargas mediante enlaces firmados con caducidad:</strong> los documentos
            protegidos no se sirven con una dirección pública permanente, sino con un enlace
            firmado y temporal que deja de funcionar al vencer.
          </li>
          <li>
            <strong>Registro de auditoría:</strong> el sistema anota quién consulta, sube o
            descarga cada documento, y cuándo lo hace.
          </li>
          <li>
            <strong>Cifrado en tránsito</strong> mediante HTTPS entre la aplicación, el panel y los
            servidores de la firma.
          </li>
          <li>
            <strong>Copias de seguridad y separación de entornos</strong>, con el entorno de
            demostración separado del entorno con datos reales.
          </li>
        </ul>
        <p>
          Ningún sistema es infalible. Si llegara a producirse una vulneración que afecte
          significativamente sus derechos, se lo comunicaremos por los canales que tenemos
          registrados y, cuando corresponda, informaremos a la autoridad competente.
        </p>
      </Seccion>

      <Seccion id="derechos" title="Sus derechos y cómo ejercerlos">
        <p>Usted puede ejercer, sin coste, los siguientes derechos:</p>
        <ul>
          <li>
            <strong>Acceder</strong> a los datos personales que tratamos sobre usted y conocer su
            origen y uso.
          </li>
          <li>
            <strong>Rectificar</strong> datos inexactos o incompletos, y{' '}
            <strong>actualizarlos</strong> cuando cambien (por ejemplo, un teléfono o una
            dirección nuevos).
          </li>
          <li>
            <strong>Oponerse</strong> a un tratamiento concreto y <strong>retirar su
            consentimiento</strong> para el uso de la aplicación cuando no exista otra base legal
            que lo justifique.
          </li>
          <li>
            <strong>Solicitar la eliminación</strong> de su cuenta y de sus datos personales.
          </li>
          <li>
            <strong>Solicitar la portabilidad</strong> de los datos que aportó, en un formato
            electrónico estructurado.
          </li>
        </ul>
        <p>
          Puede actualizar sus datos de contacto desde la sección <strong>Perfil</strong> de la
          aplicación. Para cualquier otro derecho, escriba a{' '}
          <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a> o a{' '}
          <a href={`mailto:${company.emailManagement}`}>{company.emailManagement}</a> indicando su
          nombre, el correo con el que está registrado y qué derecho desea ejercer. Le pediremos la
          información mínima indispensable para confirmar su identidad y le responderemos en el
          plazo que fija la normativa aplicable. Si considera que no hemos atendido correctamente su
          solicitud, puede acudir a la autoridad de protección de datos personales de Costa Rica.
        </p>

        <Seccion id="eliminacion" title="Eliminación de la cuenta y de los datos" sub>
          <p>
            <strong>Desde la propia aplicación:</strong> puede abrir <strong>Perfil</strong> y
            pulsar <strong>«Eliminar mi cuenta»</strong>. La aplicación pide escribir la palabra
            ELIMINAR como confirmación; al aceptar, sus datos de acceso se eliminan y sus
            expedientes quedan desvinculados del portal, tal como se explica más abajo.
          </p>
          <p>
            <strong>Por solicitud:</strong> si prefiere pedirlo por escrito, escriba a{' '}
            <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a> desde el correo
            registrado. Tramitaremos la solicitud en el plazo legal aplicable.
          </p>
          <p>
            <strong>Qué puede conservarse y por qué:</strong> la eliminación de la cuenta no borra
            automáticamente el expediente profesional ni la documentación asociada, porque la firma
            está obligada a conservar los registros contables, tributarios y la documentación de los
            trámites realizados durante los plazos legales aplicables en Costa Rica, y porque puede
            necesitarlos para acreditar el trabajo profesional realizado. Esos datos quedan
            conservados solo durante esos plazos, con acceso restringido y sin uso para otras
            finalidades; al terminar el plazo se eliminan.
          </p>
          <p>
            Eliminar la cuenta de la aplicación <strong>no cancela por sí sola</strong> el contrato
            de servicios profesionales ni las obligaciones de pago ya devengadas; para eso debe
            seguirse lo previsto en los <Link to="/terminos">Términos y Condiciones</Link>.
          </p>
        </Seccion>
      </Seccion>

      <Seccion id="menores" title="Menores de edad">
        <p>
          La aplicación está dirigida a personas mayores de edad con capacidad legal para contratar
          servicios profesionales. No recogemos conscientemente datos de menores de edad sin la
          participación de su padre, madre o representante legal. Cuando un trámite requiera datos
          de una persona menor de edad, esos datos se aportan <strong>por su representante
          legal</strong> y se tratan únicamente para completar el trámite ante el ente
          correspondiente. Si detectamos que hemos recibido datos de un menor sin esa
          participación, los eliminaremos al tener conocimiento de ello.
        </p>
      </Seccion>

      <Seccion id="cambios" title="Cambios en esta política">
        <p>
          Podemos actualizar esta política para reflejar cambios en la aplicación, en los servicios
          que prestamos o en la normativa aplicable. La <strong>fecha de última actualización</strong>{' '}
          que aparece al inicio del documento indica la versión vigente. Si el cambio afecta de
          forma relevante el uso de sus datos, se lo comunicaremos por los canales registrados
          (correo electrónico o aviso dentro de la aplicación) antes de que entre en vigor.
        </p>
        <p>
          La versión vigente está siempre publicada en esta dirección, para que pueda consultarla
          cuando quiera.
        </p>
      </Seccion>

      <Seccion id="contacto" title="Cómo contactarnos">
        <p>
          Para cualquier consulta sobre esta política o sobre el tratamiento de sus datos
          personales, escríbanos o llámenos:
        </p>
        <ul>
          <li>
            <strong>Responsable:</strong> {company.legalName}
          </li>
          <li>
            <strong>Dirección:</strong> {company.address}
          </li>
          <li>
            <strong>Soporte y privacidad:</strong>{' '}
            <a href={`mailto:${company.emailOrders}`}>{company.emailOrders}</a>
          </li>
          <li>
            <strong>Dirección general:</strong>{' '}
            <a href={`mailto:${company.emailManagement}`}>{company.emailManagement}</a>
          </li>
          <li>
            <strong>Teléfonos:</strong> {company.phones.join(' · ')}
          </li>
          <li>
            <strong>Sitio web:</strong> <a href={company.site}>{company.site}</a>
          </li>
        </ul>
      </Seccion>
    </LegalPageShell>
  )
}
