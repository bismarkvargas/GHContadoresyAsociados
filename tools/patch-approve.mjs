// Reemplaza el cuerpo del método Approve (AdminOnboardingController) por una llamada
// al servicio compartido AccountActivationService, para que el alta desde el panel y el
// registro automático usen exactamente el mismo camino.
import { readFileSync, writeFileSync } from 'node:fs'

const ruta = 'api/src/GH.Api/Controllers/Admin/AdminOnboardingController.cs'
const lineas = readFileSync(ruta, 'utf8').split(/\r?\n/)

const marcaInicio = lineas.findIndex((l) => l.includes('var email = accountRequest.Email.Trim().ToLowerInvariant();'))
const marcaFin = lineas.findIndex((l, i) => i > marcaInicio && l.trim() === '}' && lineas[i - 1].trim() === '});')

if (marcaInicio < 0 || marcaFin < 0) {
  console.error('No se localizaron los límites del método Approve', { marcaInicio, marcaFin })
  process.exit(1)
}

const nuevo = `        var resultado = await _activacion.ActivarAsync(
            accountRequest,
            roleId: request?.RoleId,
            clientType: request?.ClientType,
            tags: request?.Tags,
            assignedToUserId: request?.AssignedToUserId,
            notificarBienvenida: true,
            ct: ct);

        await _audit.LogAsync("approve", "AccountRequest", accountRequest.Id.ToString(),
            after: new { accountRequest.Email, clientCode = resultado.Client.Code, userId = resultado.User.Id }, ct: ct);

        await _realtime.ToStaffAsync("accountrequest.approved", new
        {
            accountRequestId = accountRequest.Id,
            email = accountRequest.Email,
            userId = resultado.User.Id,
            clientId = resultado.Client.Id,
            clientCode = resultado.Client.Code,
            at = DateTime.UtcNow,
        }, ct);

        // El app que espera en la pantalla de seguimiento recibe el cambio al instante.
        await _realtime.ToUserAsync(resultado.User.Id, "account.approved",
            new { clientId = resultado.Client.Id, clientCode = resultado.Client.Code, canLogin = true }, ct);

        return Ok(new
        {
            message = "Solicitud aprobada. El cliente ya puede iniciar sesión.",
            userId = resultado.User.Id,
            clientId = resultado.Client.Id,
            clientCode = resultado.Client.Code,
            temporaryPassword = resultado.PasswordTemporal,
        });
    }`

const resultado = [...lineas.slice(0, marcaInicio), nuevo, ...lineas.slice(marcaFin + 1)]
writeFileSync(ruta, resultado.join('\n'), 'utf8')
console.log(`Método Approve simplificado: se reemplazaron las líneas ${marcaInicio + 1} a ${marcaFin + 1}.`)
