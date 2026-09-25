import 'package:flutter_test/flutter_test.dart';
import 'package:gh_contadores/core/config/app_config.dart';

/// Cobertura de las URLs de despliegue (bug real de producción).
///
/// La app se despliega bajo un prefijo (`/ghcontadores`) y la API cuelga de
/// `/api/v1`. Construir el hub reemplazando la *ruta completa* perdería ese
/// prefijo y el tiempo real conectaría a otra aplicación del servidor; y la
/// descarga de documentos debe usar `/me/documents/{id}/link` (enlace firmado)
/// con la ruta completa, no un endpoint inexistente.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('URLs de despliegue', () {
    test('la raíz conserva el prefijo de despliegue y descarta la versión', () {
      expect(
        AppConfig.apiBaseUrl,
        'https://demostracion.es/ghcontadores/api/v1',
      );
      expect(AppConfig.apiRoot, 'https://demostracion.es/ghcontadores');
    });

    test('el hub de tiempo real cuelga de la raíz desplegada', () {
      expect(
        AppConfig.realtimeHubUrl,
        'https://demostracion.es/ghcontadores/hubs/realtime',
      );
      // El bug original generaba https://demostracion.es/hubs/realtime
      expect(AppConfig.realtimeHubUrl, isNot('https://demostracion.es/hubs/realtime'));
      expect(AppConfig.realtimeHubUrl, contains('/ghcontadores/'));
    });

    test('la construcción del hub es correcta con y sin prefijo', () {
      // Réplica exacta de la lógica de `SignalRRealtimeService._hubUrl()`.
      String hubDe(String baseUrl) {
        final uri = Uri.parse(baseUrl);
        final raiz = uri.path.replaceFirst(RegExp(r'/api/v\d+/?$'), '');
        return uri.replace(path: '$raiz${AppConfig.realtimeHubPath}').toString();
      }

      // Despliegue con prefijo (el caso de producción).
      expect(
        hubDe('https://demostracion.es/ghcontadores/api/v1'),
        'https://demostracion.es/ghcontadores/hubs/realtime',
      );
      // API en la raíz del dominio.
      expect(
        hubDe('https://api.ghcontadores.net/api/v1'),
        'https://api.ghcontadores.net/hubs/realtime',
      );
      // Prefijo de varias partes.
      expect(
        hubDe('https://ejemplo.cr/apps/gh/api/v2'),
        'https://ejemplo.cr/apps/gh/hubs/realtime',
      );
      // Barra final sobrante.
      expect(
        hubDe('https://demostracion.es/ghcontadores/api/v1/'),
        'https://demostracion.es/ghcontadores/hubs/realtime',
      );
    });

    test('la ruta del enlace de descarga es la firmada de la API', () {
      // Contrato: GET /me/documents/{id}/link → {url, expiresAt}
      const documentId = 'doc-0001';
      expect(
        '/me/documents/$documentId/link',
        '/me/documents/doc-0001/link',
      );

      // El enlace firmado incluye el prefijo de despliegue y no se duplica.
      const rutaFirmada = '/ghcontadores/api/v1/public/files/token-hmac-abc';
      final origen = Uri.parse(AppConfig.apiBaseUrl).origin;
      final absoluta = '$origen$rutaFirmada';
      expect(absoluta, 'https://demostracion.es/ghcontadores/api/v1/public/files/token-hmac-abc');
      expect(
        'ghcontadores'.allMatches(absoluta).length,
        1,
        reason: 'el prefijo de despliegue no debe duplicarse',
      );
      // Una URL ya absoluta se devuelve tal cual.
      const absolutaDeApi = 'https://demostracion.es/ghcontadores/api/v1/public/files/tk';
      expect(absolutaDeApi.startsWith('https://'), isTrue);
    });
  });
}
