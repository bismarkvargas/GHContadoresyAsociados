using GH.Domain.Abstractions;
using GH.Infrastructure.Data;
using GH.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;

namespace GH.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registra la base de datos MySQL, el almacenamiento de documentos, la pasarela
    /// simulada, el push de Firebase y los servicios transversales de la aplicación.
    /// </summary>
    public static IServiceCollection AddGhInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MySql")
            ?? "server=localhost;port=3306;database=ghcontadores;user=ghcontadores;password=ghcontadores;";

        // Se fija la versión del servidor en lugar de autodetectarla: así la API arranca
        // aunque la base de datos esté momentáneamente caída y `dotnet ef` no necesita conexión.
        var serverVersionText = configuration["Database:ServerVersion"] ?? "8.0.36";
        var serverVersion = ServerVersion.Create(Version.Parse(serverVersionText), ServerType.MySql);

        services.AddDbContext<GhDbContext>(options =>
        {
            options.UseMySql(connectionString, serverVersion, mysql =>
            {
                mysql.EnableRetryOnFailure(3);
                mysql.CommandTimeout(60);
            });
            options.EnableDetailedErrors();
        });

        services.Configure<StorageOptions>(configuration.GetSection("Storage"));
        services.Configure<FirebaseOptions>(configuration.GetSection("Firebase"));

        services.AddHttpClient("fcm", c => c.Timeout = TimeSpan.FromSeconds(20));

        services.AddSingleton<IDateTimeProvider, DateTimeProvider>();
        services.AddScoped<ICodeGenerator, CodeGenerator>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped<IStorageService, StorageService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<PaymentGatewaySimulator>();
        services.AddSingleton<IPushSender, FirebasePushSender>();

        return services;
    }

    /// <summary>Aplica las migraciones pendientes y siembra los datos base.</summary>
    public static async Task MigrateAndSeedAsync(this IServiceProvider provider, IConfiguration configuration, CancellationToken ct = default)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GhDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("GH.Seed");

        var attempts = 0;
        while (true)
        {
            try
            {
                await db.Database.MigrateAsync(ct);
                break;
            }
            catch (Exception ex) when (attempts++ < 8)
            {
                logger.LogWarning("Base de datos no disponible ({Message}); reintento {Attempt}/8 en 5 s.", ex.Message, attempts);
                await Task.Delay(TimeSpan.FromSeconds(5), ct);
            }
        }

        var catalogPath = configuration["Seed:CatalogPath"];
        if (string.IsNullOrWhiteSpace(catalogPath))
            catalogPath = Path.Combine(AppContext.BaseDirectory, "Seed", "catalog.seed.json");

        await DbSeeder.SeedAsync(db, logger, catalogPath, ct);
    }
}
