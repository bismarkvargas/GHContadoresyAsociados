-- ---------------------------------------------------------------------------
-- Limpieza de los datos que generan las pruebas automáticas.
--
-- Las suites (deploy/smoke-test.sh, tools/e2e-admin, tools/demo-data) crean clientes,
-- pedidos, expedientes, solicitudes y notificaciones para comprobar el sistema de
-- extremo a extremo. Este script los retira y deja el entorno de demostración limpio.
--
-- Uso:  mysql -u ghcontadores -p ghcontadores < deploy/limpiar-datos-prueba.sql
--
-- NO borra clientes reales: solo los que llevan los prefijos de las pruebas.
-- ---------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

CREATE TEMPORARY TABLE tmp_clientes AS
SELECT Id FROM Clients
WHERE LegalName LIKE 'Prueba Humo%'
   OR LegalName LIKE 'Prueba Cadena Vacia%'
   OR LegalName LIKE 'Cliente E2E %'
   OR LegalName LIKE 'Registro Automatico %'
   OR LegalName LIKE 'Con Aprobacion %'
   OR LegalName LIKE 'Cliente Diagnostico %'
   OR LegalName LIKE 'Diagnostico %'
   OR LegalName LIKE 'Inspeccion %'
   OR LegalName LIKE 'Cliente creado por prueba%';

CREATE TEMPORARY TABLE tmp_expedientes AS SELECT Id FROM CaseFiles WHERE ClientId IN (SELECT Id FROM tmp_clientes);
CREATE TEMPORARY TABLE tmp_pedidos AS SELECT Id FROM Orders WHERE ClientId IN (SELECT Id FROM tmp_clientes);
CREATE TEMPORARY TABLE tmp_usuarios AS
SELECT Id FROM Users
WHERE ClientId IN (SELECT Id FROM tmp_clientes)
   OR Email LIKE 'prueba.humo.%' OR Email LIKE 'e2e.%' OR Email LIKE 'auto.%'
   OR Email LIKE 'aprob.%' OR Email LIKE 'corta.%' OR Email LIKE 'diag.%' OR Email LIKE 'inspeccion.%';

DELETE FROM Messages     WHERE ClientId IN (SELECT Id FROM tmp_clientes) OR CaseFileId IN (SELECT Id FROM tmp_expedientes);
DELETE FROM CaseEvents   WHERE CaseFileId IN (SELECT Id FROM tmp_expedientes);
DELETE FROM CaseTasks    WHERE CaseFileId IN (SELECT Id FROM tmp_expedientes);
DELETE FROM Documents    WHERE ClientId IN (SELECT Id FROM tmp_clientes) OR CaseFileId IN (SELECT Id FROM tmp_expedientes);
DELETE FROM Notifications           WHERE UserId IN (SELECT Id FROM tmp_usuarios);
DELETE FROM DeviceTokens            WHERE UserId IN (SELECT Id FROM tmp_usuarios);
DELETE FROM RefreshTokens           WHERE UserId IN (SELECT Id FROM tmp_usuarios);
DELETE FROM NotificationPreferences WHERE UserId IN (SELECT Id FROM tmp_usuarios);
DELETE FROM UserRoles               WHERE UserId IN (SELECT Id FROM tmp_usuarios);
DELETE FROM Payments   WHERE OrderId IN (SELECT Id FROM tmp_pedidos);
DELETE FROM OrderItems WHERE OrderId IN (SELECT Id FROM tmp_pedidos);
DELETE FROM Orders     WHERE Id IN (SELECT Id FROM tmp_pedidos);
DELETE FROM ClientInteractions WHERE ClientId IN (SELECT Id FROM tmp_clientes);
DELETE FROM ClientContacts     WHERE ClientId IN (SELECT Id FROM tmp_clientes);
DELETE FROM CaseFiles          WHERE Id IN (SELECT Id FROM tmp_expedientes);
UPDATE Clients SET UserId = NULL WHERE Id IN (SELECT Id FROM tmp_clientes);
DELETE FROM Users   WHERE Id IN (SELECT Id FROM tmp_usuarios);
DELETE FROM Clients WHERE Id IN (SELECT Id FROM tmp_clientes);
DELETE FROM AccountRequests
WHERE Email LIKE 'prueba.humo.%' OR Email LIKE 'e2e.%' OR Email LIKE 'auto.%' OR Email LIKE 'aprob.%'
   OR Email LIKE 'corta.%' OR Email LIKE 'diag.%'
   OR FullName LIKE 'Prueba Humo%' OR FullName LIKE 'Registro Automatico%'
   OR FullName LIKE 'Con Aprobacion%' OR FullName LIKE 'Clave Corta%';

-- La campana del panel arranca sin el ruido de las pruebas: se retiran los avisos que
-- las suites generaron para el personal y se conservan los del cliente.
DELETE n FROM Notifications n JOIN Users u ON n.UserId = u.Id WHERE u.IsStaff = 1;
DELETE ci FROM CartItems ci JOIN Carts c ON ci.CartId = c.Id WHERE c.Status = 1;

SET FOREIGN_KEY_CHECKS = 1;

SELECT (SELECT COUNT(*) FROM Clients WHERE IsDeleted = 0)   AS clientes,
       (SELECT COUNT(*) FROM CaseFiles)                     AS expedientes,
       (SELECT COUNT(*) FROM Products)                      AS servicios,
       (SELECT COUNT(*) FROM Orders)                        AS pedidos,
       (SELECT COUNT(*) FROM AccountRequests)               AS solicitudes,
       (SELECT COUNT(*) FROM QuoteRequests)                 AS cotizaciones,
       (SELECT COUNT(*) FROM Users)                         AS usuarios;
