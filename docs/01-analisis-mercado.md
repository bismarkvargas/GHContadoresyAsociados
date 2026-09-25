# GH Contadores y Asociados — Informe de análisis previo

> Auditoría del sitio en vivo `https://www.ghcontadores.net` (Wix) + competencia hispanohablante del sector contable/legal.
> Fuente: crawl propio del 100 % de las fichas de producto (`tools/catalog-import/`). Fecha: sesión actual.

## 1. Qué es el negocio hoy

- Firma **costarricense** de contabilidad + trámites legales/municipales/tributarios. No es un bufete penal/familiar: es **consultoría contable-legal corporativa** con foco en *constituir y mantener empresas en regla*.
- Datos reales extraídos del sitio:
  - Dirección: GH Contadores & Asociados, Ruta Nacional Secundaria 155, **Huacas, Santa Cruz, Guanacaste, Costa Rica**.
  - Teléfonos: **+506 2653 6634** y **+506 8846 9454**.
  - Correos: **gustavo.ghcontadores@outlook.com** (dirección/gerencia) y **pedidos@ghcontadores.net** (soporte de pedidos).
  - Zona horaria comercial: `America/Costa_Rica` (UTC−6).
- Público objetivo declarado en su propio copy: **emprendedores, inversionistas y extranjeros** que quieren operar en Costa Rica.

## 2. Arquitectura de información actual (sitio Wix)

| Nivel | Contenido |
|---|---|
| Home | Claim «En GH Contadores lo resolvemos por usted» + 3 bloques: Contabilidad, Trámites legales, Formularios en línea |
| 5 categorías | `servicios` (raíz, 62 ítems), `servicios-contables` (21), `servicios-legales` (22), `servicios-municipales` (4), `servicios-tributarios` (10) |
| 62 fichas | `/product-page/<slug>` con precio en **USD**, imagen, botón *Agregar al carrito* |
| Formularios | `formulario-de-cotizaciones`, `contact-3` (contacto) |
| Páginas sueltas | `copia-de-certificación-de-ingresos`, `copia-de-certificación-de-saldo-acreedor`, `copia-de-constancia-de-ingresos` (×2) → contenido duplicado sin URL canónica |
| Cuenta | Enlace «Iniciar sesión» de la tienda Wix (sin portal real de cliente) |

- La tienda ya vende (Wix Stores) pero **sin expediente**: el cliente paga y no tiene dónde ver el avance de su trámite.
- Precios reales: **mín. 16,95 USD** (`Confección Declaración Multas D-116`) → **máx. 960,50 USD** (`Trámite Municipal - Patente comercial con venta de licores`). Ticket mediano ≈ 169,50 USD.
- El ente regulador aparece en el propio nombre del servicio: SUGEF, ACAM, ATV, CCSS, INS, MEIC, MAG, ICT, RTBF, MEIC, Ministerio de Salud, municipalidades. Costa Rica paga y tramita **D-101/D-103/D-104/D-115/D-140**.

## 3. Huecos y oportunidades (lo que el nuevo sistema debe resolver)

1. **Sin portal de cliente**: no hay expediente, ni documentos, ni estado. El negocio se gestiona por teléfono/correo. → CRM + expedientes + documentos + app.
2. **Sin alta de clientes controlada**: cualquiera compra sin verificación ni expediente fiscal. → solicitud de cuenta desde el app con aprobación del admin.
3. **Compra sin trazabilidad**: un ítem de carrito no se convierte en caso de trabajo. → el pedido genera expediente y se asigna a un profesional.
4. **Catálogo duplicado y sin normalizar**: 62 productos repartidos entre categoría raíz y subcategorías, con acentos y espacios en las URLs, textos «Esta es la descripción de tu categoría» de plantilla. → catálogo normalizado con slug limpio, categoría primaria y descripciones reales.
5. **Cero notificación proactiva**: el cliente debe llamar para saber si su trámite avanzó. → push FCM por evento de proceso.
6. **Sin roles**: no hay forma de que un abogado, un contador y un asistente compartan herramienta con permisos distintos. → RBAC granular.
7. **Precio solo en USD y sin checkout propio**: se depende de Wix para cobrar. → checkout propio con pasarela simulada y estados de orden.
8. **Marca poco aplicada**: la plantilla usa la paleta por defecto de Wix; solo el rojo `#DF3131` y los oscuros se aplican de verdad. → tokens de marca únicos y consistentes en admin y app.

## 4. Competencia (referencia de sector, no de copia)

Bufetes contable-legales de habla hispana (Costa Rica, Panamá, México, Colombia) compiten con: portal de cliente con **estado de trámite en línea**, **expediente digital con checklist documental**, **recordatorios automáticos de vencimientos** (declaraciones mensuales/anuales), **firma/entrega de documentos** y **pago en línea**. Es exactamente el terreno donde este sistema debe jugar.

## 5. Decisiones que se derivan (y cómo se reflejan)

| Hallazgo | Decisión en el sistema |
|---|---|
| Instituciones CR (SUGEF, ACAM, ATV, CCSS…) | Campo `CourtOrEntity` en el expediente, con catálogo de entes precargado |
| Precio en USD | Moneda base `USD`; `CRC` soportada con tipo de cambio configurable en ajustes |
| 4 subcategorías + raíz | 4 categorías primarias normalizadas; producto siempre con categoría principal y categorías secundarias |
| Trámites de extranjeros/inversionistas | Campo `ClientType` (persona física/jurídica/extranjero) y expediente con `Matter` específico |
| Cotizaciones en formulario | Módulo *Solicitudes de cotización* que entra al CRM como lead |
| Contacto con 2 correos y 2 teléfonos | Datos corporativos en Ajustes y usados en el app (contacto directo, WhatsApp) |
| Compra → trabajo | Pedido pagado ⇒ expediente + tareas + asignación a profesional |

## 6. Navegación del app (derivada del sitio)

`Inicio` (marca + destacados) · `Servicios` (4 categorías, buscador) · `Ficha de servicio` (precio USD, descripción, duración, agrega al carrito o "lo quiero") · `Carrito` · `Checkout simulado` · `Mis expedientes` (estado + timeline) · `Documentos` (PDFs por expediente) · `Mensajes` · `Notificaciones` · `Perfil` (datos fiscales, direcciones, preferencias de push, métodos de pago guardados de mentira).

## 7. Tokens de marca (extraídos del sitio en vivo)

Aplicados en el markup real: `#DF3131` (rojo corporativo, 9 usos), `#212121` (texto/estructura), `#E62214` (rojo de acción), `#ECEFF3` (superficie clara), `#008250` (éxito), `#646464`/`#696969` (neutro).

```
--gh-primary:      #DF3131   /* rojo corporativo */
--gh-primary-600:  #C42121   /* hover/pressed */
--gh-primary-50:   #FDECEC   /* fondo suave */
--gh-ink:          #212121   /* texto principal / sidebar */
--gh-ink-700:      #3A3A3A
--gh-muted:        #646464
--gh-surface:      #ECEFF3
--gh-surface-2:    #F7F8FA
--gh-border:       #E2E5E9
--gh-success:      #008250
--gh-warning:      #D49341
--gh-danger:       #E62214
--gh-info:         #116DFF
```

Tipografía: sistema (Inter/SF Pro/Roboto según plataforma) con escala 12/14/16/20/24/32. Radios: 10 px (controles), 16 px (tarjetas). Sombra única suave. Todos los tokens se exponen en CSS variables (admin) y en `ThemeData`/`GhTokens` (Flutter).

## 8. Riesgos

- Contenido de fichas de servicio es escaso (3 sin descripción JSON-LD): las descripciones se generan con plantilla y el admin puede editarlas.
- El sitio actual tiene URLs con acentos: el catálogo nuevo usa slug ASCII y guarda `sourceUrl` para redirecciones.
- `demostracion.es` hospeda otros sitios: el despliegue debe ser **solo** bajo `/ghcontadores/` sin tocar otras vhosts.
