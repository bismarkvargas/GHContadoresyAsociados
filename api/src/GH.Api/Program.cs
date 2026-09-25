using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using GH.Api.Auth;
using GH.Api.Realtime;
using GH.Api.Services;
using GH.Domain.Abstractions;
using GH.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ------------------------------------------------------------------ configuración
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));

// ------------------------------------------------------------------ infraestructura
builder.Services.AddGhInfrastructure(builder.Configuration);

// ------------------------------------------------------------------ http / json
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        // Los formularios del panel y del app envían "" en los campos opcionales:
        // se interpreta como ausencia de valor en lugar de devolver 400.
        options.JsonSerializerOptions.Converters.Add(new GH.Api.Json.EmptyStringToNullableGuidConverter());
        options.JsonSerializerOptions.Converters.Add(new GH.Api.Json.EmptyStringToGuidConverter());
        options.JsonSerializerOptions.Converters.Add(new GH.Api.Json.EmptyStringToNullableIntConverter());
        options.JsonSerializerOptions.Converters.Add(new GH.Api.Json.EmptyStringToNullableDecimalConverter());
        options.JsonSerializerOptions.Converters.Add(new GH.Api.Json.EmptyStringToNullableDateTimeConverter());
    });

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 50 * 1024 * 1024;
});

builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.MaximumReceiveMessageSize = 512 * 1024;
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<IRealtimeNotifier, SignalRRealtimeNotifier>();
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddScoped<DocumentService>();
builder.Services.AddScoped<OrderWorkflowService>();

// ------------------------------------------------------------------ autenticación
var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"] ?? throw new InvalidOperationException("Falta Jwt:Key en la configuración.");
if (jwtKey.Length < 32) jwtKey = jwtKey.PadRight(32, '0');

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtSection["Issuer"] ?? "GHContadores",
        ValidateAudience = true,
        ValidAudience = jwtSection["Audience"] ?? "GHContadoresClient",
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
        RoleClaimType = System.Security.Claims.ClaimTypes.Role,
        NameClaimType = System.Security.Claims.ClaimTypes.Name,
    };
    // SignalR no puede enviar cabeceras en el handshake del navegador: token por query string.
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                context.Token = accessToken;
            return Task.CompletedTask;
        },
    };
});

// ------------------------------------------------------------------ autorización por permisos
builder.Services.AddSingleton<Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddScoped<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddAuthorization();

// ------------------------------------------------------------------ CORS
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://127.0.0.1:5173", "https://demostracion.es" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("gh", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

// ------------------------------------------------------------------ límite de peticiones
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    options.AddPolicy("public-write", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }));
});

// ------------------------------------------------------------------ swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "GH Contadores y Asociados — API",
        Version = "v1",
        Description = "API del sistema de gestión contable-legal: CRM, expedientes, documentos, catálogo, pedidos y notificaciones.",
        Contact = new OpenApiContact { Name = "GH Contadores & Asociados", Email = "pedidos@ghcontadores.net" },
    });

    var security = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Token JWT obtenido en /api/v1/auth/login",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    options.AddSecurityDefinition("Bearer", security);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement { [security] = Array.Empty<string>() });
});

// ------------------------------------------------------------------ aplicación
var app = builder.Build();

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    Converters = { new JsonStringEnumConverter() },
};

app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
    var (status, title, detail) = feature?.Error switch
    {
        KeyNotFoundException ex => (StatusCodes.Status404NotFound, "Recurso no encontrado", ex.Message),
        UnauthorizedAccessException ex => (StatusCodes.Status403Forbidden, "Acceso denegado", ex.Message),
        InvalidOperationException ex => (StatusCodes.Status400BadRequest, "Operación no válida", ex.Message),
        ArgumentException ex => (StatusCodes.Status400BadRequest, "Solicitud no válida", ex.Message),
        _ => (StatusCodes.Status500InternalServerError, "Error interno del servidor", "Ocurrió un error inesperado al procesar la solicitud."),
    };

    context.Response.StatusCode = status;
    context.Response.ContentType = "application/problem+json";
    await context.Response.WriteAsJsonAsync(new
    {
        title,
        status,
        detail,
        traceId = context.TraceIdentifier,
    }, jsonOptions);
}));

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("v1/swagger.json", "GH Contadores API v1");
    options.RoutePrefix = "swagger";
    options.DocumentTitle = "GH Contadores API";
});

app.UseCors("gh");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<RealtimeHub>("/hubs/realtime");

// Comprobación de salud usada por Nginx y por el despliegue.
app.MapGet("/health", async (GH.Infrastructure.Data.GhDbContext db) =>
{
    var canConnect = await db.Database.CanConnectAsync();
    return Results.Json(new
    {
        status = canConnect ? "ok" : "degraded",
        database = canConnect ? "up" : "down",
        serverTimeUtc = DateTime.UtcNow,
    }, jsonOptions);
});

// Migración + siembra al arrancar (permisos, roles, usuarios, ajustes y catálogo real).
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await app.Services.MigrateAndSeedAsync(app.Configuration);
        logger.LogInformation("Base de datos lista y datos base sembrados.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "No se pudo inicializar la base de datos. La API arrancará en modo degradado.");
    }
}

app.Run();

/// <summary>Punto de entrada expuesto para las pruebas de integración.</summary>
public partial class Program;
