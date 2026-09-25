# Recursos para publicar en Google Play

Todo lo que hay en esta carpeta está generado con `node tools/brand-assets.mjs`
(iconos, gráfico destacado) y `node tools/play-screenshots.mjs` (capturas del teléfono).

## Archivos y dónde va cada uno

| Archivo | Tamaño | Dónde se sube en Play Console |
|---|---|---|
| `icono-512.png` | 512 × 512 | *Ficha de Play Store → Ícono de la app* |
| `grafico-destacado-1024x500.png` | 1024 × 500 | *Ficha de Play Store → Gráfico destacado* |
| `capturas/*.png` | 1080 × 2160 | *Ficha de Play Store → Capturas de teléfono* (de 2 a 8) |

Cumplen los requisitos de Google Play: PNG de 24 bits **sin transparencia**, dentro del rango
320–3840 px y con relación de aspecto máxima 1:2 (las capturas del teléfono salen en 1080×2400,
que es 1:2.22 y Play rechazaría, así que se recortan a 1080×2160).

El **icono de la app en Android** (el que se instala) se genera aparte, en
`app-movil/android/app/src/main/res/mipmap-*/`, con su versión adaptativa en
`mipmap-anydpi-v26/` (fondo azul marino con la franja verde lima y la marca en blanco).

## Textos sugeridos para la ficha

**Nombre de la aplicación** (máx. 30 caracteres):

```
GH Contadores
```

**Descripción breve** (máx. 80 caracteres):

```
Contabilidad, trámites legales y municipales en Costa Rica, con expediente en línea.
```

**Descripción completa** (máx. 4000 caracteres):

```
GH Contadores & Asociados es la firma contable y legal que resuelve sus trámites en Costa Rica
de forma clara, rápida y sin complicaciones.

Desde la app usted puede:

· Comprar servicios contables, legales, municipales y tributarios, con precio claro en dólares.
· Seguir el avance de sus expedientes en tiempo real: estado, actuaciones y próximos vencimientos.
· Subir y consultar sus documentos (cédulas, personerías, estados financieros, constancias).
· Recibir avisos al instante cuando la firma realiza una gestión o requiere algo de usted.
· Escribir directamente a su profesional asignado y conservar el historial.
· Consultar y pagar sus servicios y ver el estado de sus pedidos.

Servicios que gestionamos, entre otros:
· Contabilidad mensual, trimestral y anual, estados financieros y facturación electrónica.
· Declaraciones ante la Administración Tributaria Virtual (D-101, D-103, D-104, D-115, D-140, RTBF).
· Trámites ante SUGEF, ACAM, CCSS, INS, MEIC, MAG e ICT.
· Patentes comerciales, permisos de licores y trámites municipales.
· Poderes, contratos, composición accionaria y constitución de sociedades.
· Permisos sanitarios y trámites del Ministerio de Salud.

¿Quién puede usar la app?
Cualquier persona puede consultar el catálogo y solicitar su cuenta. Los clientes de la firma
acceden además a sus expedientes, documentos y pedidos.

Sobre la firma:
GH Contadores & Asociados
Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica
Teléfono: +506 2653 6634 · +506 8846 9454
Correo: gustavo.ghcontadores@outlook.com · pedidos@ghcontadores.net
```

**Clasificación de contenido**: Negocios / Productividad. No contiene anuncios ni compras dentro
de la app distintas del pago de servicios profesionales.

## Antes de publicar: comprobaciones

1. **Firma**: el APK/AAB debe estar firmado con el keystore de producción
   (`app-movil/android/keystore/gh-contadores-release.jks`). El archivo `android/key.properties`
   con las credenciales **no se versiona**; consérvelo junto con el keystore en un lugar seguro:
   si se pierde, no podrá publicar actualizaciones con la misma identidad.
2. **Política de privacidad**: Play la exige. Debe publicarse una URL pública (puede ser una
   página dentro de `https://demostracion.es/ghcontadores/`) que describa qué datos se recogen
   (nombre, correo, teléfono, cédula, documentos de expediente) y con qué finalidad.
3. **Eliminación de cuenta**: la app ya ofrece «Eliminar cuenta» en el perfil
   (`DELETE /me/profile`), requisito obligatorio de Play.
4. **Formato de entrega**: se recomienda **AAB** (Android App Bundle) en lugar de APK:
   ```
   flutter build appbundle --release --dart-define=USE_MOCKS=false \
     --dart-define=API_BASE_URL=https://demostracion.es/ghcontadores/api/v1
   ```
   El archivo queda en `app-movil/build/app/outputs/bundle/release/app-release.aab`.
