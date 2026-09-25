// ---------------------------------------------------------------------------
// Comprobación de las URLs con las que se compila la app.
//
// Ejecutar con:  dart run tool/verificar_urls.dart
//
// Sirve para detectar el error más fácil de cometer en un despliegue bajo prefijo
// (aquí la API vive en https://demostracion.es/ghcontadores/api/v1): construir el hub de
// tiempo real reemplazando la ruta completa perdería el prefijo /ghcontadores.
// ---------------------------------------------------------------------------
import 'package:gh_contadores/core/config/app_config.dart';

int fallos = 0;

void comprobar(String descripcion, String obtenido, String esperado) {
  final ok = obtenido == esperado;
  if (!ok) fallos++;
  print('${ok ? '✔' : '✘'} $descripcion');
  print('    obtenido: $obtenido');
  if (!ok) print('    esperado: $esperado');
}

void main() {
  print('URL de la API configurada: ${AppConfig.apiBaseUrl}');
  print('Raíz de despliegue: ${AppConfig.apiRoot}\n');

  comprobar(
    'la raíz conserva el prefijo de despliegue',
    AppConfig.apiRoot,
    'https://demostracion.es/ghcontadores',
  );

  comprobar(
    'el hub de tiempo real cuelga de la raíz desplegada',
    AppConfig.realtimeHubUrl,
    'https://demostracion.es/ghcontadores/hubs/realtime',
  );

  // La misma comprobación para un despliegue sin prefijo (desarrollo local).
  comprobar(
    'una API sin prefijo genera el hub en la raíz',
    'http://localhost:5080/api/v1'.replaceFirst(RegExp(r'/api/v\d+$'), '') + AppConfig.realtimeHubPath,
    'http://localhost:5080/hubs/realtime',
  );

  print('\n${fallos == 0 ? 'Todas las URLs son correctas.' : '$fallos comprobaciones fallidas.'}');
  if (fallos > 0) throw StateError('Las URLs de la app no apuntan al despliegue esperado.');
}
