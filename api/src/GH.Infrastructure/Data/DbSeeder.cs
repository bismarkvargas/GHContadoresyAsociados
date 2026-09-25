using System.Text.Json;
using GH.Domain;
using GH.Domain.Entities;
using GH.Infrastructure.Data;
using GH.Infrastructure.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskStatus = GH.Domain.TaskStatus;

namespace GH.Infrastructure.Data;

/// <summary>
/// Siembra idempotente: permisos, roles, usuarios de la firma, ajustes de marca y el
/// catÃ¡logo real migrado desde https://www.ghcontadores.net/category/servicios.
/// Se ejecuta en cada arranque de la API y solo crea lo que falta.
/// </summary>
public static class DbSeeder
{
    private static readonly string[] Modules =
    {
        "clients", "cases", "documents", "catalog", "orders", "payments",
        "accountrequests", "quotes", "users", "roles", "reports", "settings", "audit",
        "messages", "notifications",
    };

    private static readonly Dictionary<string, string[]> ActionsByModule = new()
    {
        ["clients"] = new[] { "view", "create", "edit", "delete", "assign", "export" },
        ["cases"] = new[] { "view", "create", "edit", "delete", "assign", "export" },
        ["documents"] = new[] { "view", "upload", "delete", "approve" },
        ["catalog"] = new[] { "view", "create", "edit", "delete" },
        ["orders"] = new[] { "view", "edit", "delete", "refund", "createcase" },
        ["payments"] = new[] { "view", "refund" },
        ["accountrequests"] = new[] { "view", "approve", "reject" },
        ["quotes"] = new[] { "view", "edit", "convert" },
        ["users"] = new[] { "view", "create", "edit", "delete", "roles" },
        ["roles"] = new[] { "view", "create", "edit", "delete" },
        ["reports"] = new[] { "view", "export" },
        ["settings"] = new[] { "view", "edit" },
        ["audit"] = new[] { "view" },
        ["messages"] = new[] { "view", "send" },
        ["notifications"] = new[] { "view", "send" },
    };

    public static async Task SeedAsync(GhDbContext db, ILogger logger, string? catalogPath = null, CancellationToken ct = default)
    {
        await SeedPermissionsAsync(db, ct);
        var roleMap = await SeedRolesAsync(db, ct);
        await SeedUsersAsync(db, roleMap, logger, ct);
        await SeedSettingsAsync(db, ct);
        await SeedCatalogAsync(db, logger, catalogPath, ct);
        await SeedDemoClientAsync(db, logger, ct);
        await SyncCountersAsync(db, logger, ct);
    }

    /// <summary>
    /// Deja los contadores correlativos por delante de los cÃ³digos ya existentes.
    /// Sin esto, los datos sembrados con cÃ³digo fijo (GH-CLI-00001, GH-ORD-...-00001)
    /// chocarÃ­an con el primer cÃ³digo que genere la aplicaciÃ³n.
    /// </summary>
    private static async Task SyncCountersAsync(GhDbContext db, ILogger logger, CancellationToken ct)
    {
        var year = DateTime.UtcNow.Year;

        var clientCodes = await db.Clients.IgnoreQueryFilters().Select(c => c.Code).ToListAsync(ct);
        var caseCodes = await db.CaseFiles.IgnoreQueryFilters().Select(c => c.Code).ToListAsync(ct);
        var orderNumbers = await db.Orders.IgnoreQueryFilters().Select(o => o.Number).ToListAsync(ct);
        var trackingCodes = await db.AccountRequests.IgnoreQueryFilters().Select(r => r.TrackingCode).ToListAsync(ct);

        var targets = new Dictionary<string, long>
        {
            ["client"] = clientCodes.Select(TrailingNumber).DefaultIfEmpty(0).Max(),
            ["account-request"] = trackingCodes.Select(TrailingNumber).DefaultIfEmpty(0).Max(),
            [$"case-{year}"] = caseCodes.Where(c => c.Contains($"-{year}-")).Select(TrailingNumber).DefaultIfEmpty(0).Max(),
            [$"order-{year}"] = orderNumbers.Where(n => n.Contains($"-{year}-")).Select(TrailingNumber).DefaultIfEmpty(0).Max(),
        };

        foreach (var (key, value) in targets)
        {
            if (value <= 0) continue;
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO `EntityCounters` (`CounterKey`, `Value`) VALUES ({0}, {1}) " +
                "ON DUPLICATE KEY UPDATE `Value` = GREATEST(`Value`, {1});",
                new object[] { key, value }, ct);
        }

        logger.LogInformation("Contadores sincronizados: {Counters}.", string.Join(", ", targets.Where(t => t.Value > 0).Select(t => $"{t.Key}={t.Value}")));
    }

    /// <summary>Extrae el nÃºmero final de un cÃ³digo legible: "GH-CLI-00042" -> 42.</summary>
    private static long TrailingNumber(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return 0;
        var digits = new string(code.Reverse().TakeWhile(char.IsDigit).Reverse().ToArray());
        return long.TryParse(digits, out var value) ? value : 0;
    }

    // ------------------------------------------------------------------ permisos
    private static async Task SeedPermissionsAsync(GhDbContext db, CancellationToken ct)
    {
        var existing = await db.Permissions.Select(p => p.Code).ToListAsync(ct);
        var set = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var order = 0;

        foreach (var module in Modules)
        {
            foreach (var action in ActionsByModule[module])
            {
                order++;
                var code = $"{module}.{action}";
                if (set.Contains(code)) continue;
                db.Permissions.Add(new Permission
                {
                    Code = code,
                    Module = module,
                    Action = action,
                    Description = Describe(module, action),
                    SortOrder = order,
                });
            }
        }
        await db.SaveChangesAsync(ct);
    }

    private static string Describe(string module, string action)
    {
        var m = module switch
        {
            "clients" => "clientes del CRM",
            "cases" => "expedientes y casos",
            "documents" => "documentos",
            "catalog" => "catÃ¡logo de servicios",
            "orders" => "pedidos",
            "payments" => "pagos",
            "accountrequests" => "solicitudes de cuenta",
            "quotes" => "cotizaciones",
            "users" => "usuarios",
            "roles" => "roles",
            "reports" => "informes",
            "settings" => "ajustes",
            "audit" => "auditorÃ­a",
            "messages" => "mensajes con clientes",
            "notifications" => "notificaciones",
            _ => module,
        };
        var a = action switch
        {
            "view" => "Ver",
            "create" => "Crear",
            "edit" => "Editar",
            "delete" => "Eliminar",
            "assign" => "Asignar responsable",
            "export" => "Exportar",
            "upload" => "Subir",
            "approve" => "Aprobar",
            "reject" => "Rechazar",
            "refund" => "Reembolsar",
            "createcase" => "Generar expediente",
            "convert" => "Convertir",
            "roles" => "Gestionar roles del usuario",
            "send" => "Enviar",
            _ => action,
        };
        return $"{a} {m}";
    }

    // -------------------------------------------------------------------- roles
    private static async Task<Dictionary<string, Role>> SeedRolesAsync(GhDbContext db, CancellationToken ct)
    {
        var definitions = new (string Name, string Description, bool IsStaff, string[] Permissions)[]
        {
            ("SuperAdmin", "Acceso total al sistema, incluida la gestiÃ³n de roles y ajustes.", true, new[] { "*" }),

            ("Admin", "AdministraciÃ³n completa del negocio sin poder borrar roles de sistema.", true, new[]
            {
                "clients.*", "cases.*", "documents.*", "catalog.*", "orders.*", "payments.*",
                "accountrequests.*", "quotes.*", "users.*", "roles.view", "roles.create", "roles.edit",
                "reports.*", "settings.view", "settings.edit", "audit.view", "messages.*", "notifications.*",
            }),

            ("Abogado", "Profesional legal: gestiona expedientes legales y municipales de sus clientes.", true, new[]
            {
                "clients.view", "clients.edit", "clients.assign", "clients.export",
                "cases.view", "cases.create", "cases.edit", "cases.assign", "cases.export",
                "documents.view", "documents.upload", "catalog.view", "orders.view", "payments.view",
                "quotes.view", "quotes.edit", "reports.view", "messages.view", "messages.send", "notifications.view",
            }),

            ("Contador", "Profesional contable: gestiona expedientes contables y tributarios.", true, new[]
            {
                "clients.view", "clients.edit", "clients.export",
                "cases.view", "cases.create", "cases.edit", "cases.export",
                "documents.view", "documents.upload", "catalog.view", "orders.view", "payments.view",
                "quotes.view", "quotes.edit", "reports.view", "messages.view", "messages.send", "notifications.view",
            }),

            ("Asistente", "Apoyo administrativo: atenciÃ³n al cliente, pedidos y documentaciÃ³n.", true, new[]
            {
                "clients.view", "clients.create", "clients.edit",
                "cases.view", "cases.edit", "documents.view", "documents.upload",
                "catalog.view", "orders.view", "orders.edit", "payments.view",
                "accountrequests.view", "quotes.*", "reports.view",
                "messages.view", "messages.send", "notifications.view",
            }),

            ("Cliente", "Cliente del app: ve sus expedientes, documentos y pedidos.", false, new[]
            {
                "cases.view", "documents.view", "documents.upload", "orders.view", "payments.view",
                "messages.view", "messages.send", "notifications.view",
            }),
        };

        var allPermissions = await db.Permissions.AsNoTracking().ToListAsync(ct);
        var existingRoles = await db.Roles.Include(r => r.RolePermissions).ToListAsync(ct);
        var result = new Dictionary<string, Role>(StringComparer.OrdinalIgnoreCase);

        foreach (var def in definitions)
        {
            var role = existingRoles.FirstOrDefault(r => r.Name == def.Name);
            if (role is null)
            {
                role = new Role { Name = def.Name, Description = def.Description, IsSystem = true, IsStaffRole = def.IsStaff };
                db.Roles.Add(role);
                await db.SaveChangesAsync(ct);
                role.RolePermissions = new List<RolePermission>();
            }

            var wanted = ResolvePermissions(def.Permissions, allPermissions);
            var current = role.RolePermissions.Select(rp => rp.PermissionId).ToHashSet();
            foreach (var permission in wanted.Where(p => !current.Contains(p.Id)))
            {
                // Se registra en el DbSet para que EF lo inserte, en lugar de añadirlo solo a la
                // navegación (lo marcaría como Modified e intentaría un UPDATE inexistente).
                db.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = permission.Id });
                role.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = permission.Id });
            }

            result[def.Name] = role;
        }

        await db.SaveChangesAsync(ct);
        return result;
    }

    private static List<Permission> ResolvePermissions(string[] patterns, List<Permission> all)
    {
        var selected = new List<Permission>();
        foreach (var pattern in patterns)
        {
            if (pattern == "*") return all.ToList();
            if (pattern.EndsWith(".*"))
            {
                var module = pattern[..^2];
                selected.AddRange(all.Where(p => p.Module == module));
            }
            else
            {
                var exact = all.FirstOrDefault(p => p.Code == pattern);
                if (exact is not null) selected.Add(exact);
            }
        }
        return selected.DistinctBy(p => p.Id).ToList();
    }

    // ------------------------------------------------------------------ usuarios
    private static async Task SeedUsersAsync(GhDbContext db, Dictionary<string, Role> roles, ILogger logger, CancellationToken ct)
    {
        var hasher = new PasswordHasher<User>();
        var definitions = new (string Email, string Name, string Phone, string Password, string Role)[]
        {
            ("admin@ghcontadores.net", "Gustavo GÃ³mez HernÃ¡ndez", "+506 8846 9454", "Gh.Admin2026", "SuperAdmin"),
            ("gerencia@ghcontadores.net", "Gerencia GH Contadores", "+506 2653 6634", "Gh.Gerencia2026", "Admin"),
            ("abogado@ghcontadores.net", "Lic. Mariana SolÃ­s Rojas", "+506 8701 2233", "Gh.Abogado2026", "Abogado"),
            ("contador@ghcontadores.net", "CPA AndrÃ©s Vargas Mora", "+506 8701 4455", "Gh.Contador2026", "Contador"),
            ("asistente@ghcontadores.net", "Karla JimÃ©nez Castro", "+506 8701 6677", "Gh.Asistente2026", "Asistente"),
        };

        foreach (var def in definitions)
        {
            var email = def.Email.ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == email, ct)) continue;

            var user = new User
            {
                Email = email,
                FullName = def.Name,
                Phone = def.Phone,
                Status = UserStatus.Active,
                IsStaff = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            user.PasswordHash = hasher.HashPassword(user, def.Password);
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);

            if (roles.TryGetValue(def.Role, out var role))
            {
                db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });
                await db.SaveChangesAsync(ct);
            }

            logger.LogInformation("Usuario de la firma creado: {Email} ({Role})", email, def.Role);
        }
    }

    // ------------------------------------------------------------------- ajustes
    private static async Task SeedSettingsAsync(GhDbContext db, CancellationToken ct)
    {
        var defaults = new (string Key, string Value, string Group, string Description)[]
        {
            ("brand.name", "GH Contadores & Asociados", "Marca", "Nombre comercial de la firma"),
            ("brand.shortName", "GH Contadores", "Marca", "Nombre corto para el app"),
            ("brand.primaryColor", "#DF3131", "Marca", "Rojo corporativo (extraÃ­do de ghcontadores.net)"),
            ("brand.inkColor", "#212121", "Marca", "Color de estructura y texto principal"),
            ("brand.accentColor", "#E62214", "Marca", "Color de acciÃ³n"),
            ("brand.successColor", "#008250", "Marca", "Color de Ã©xito"),
            ("brand.logoUrl", "", "Marca", "URL pÃºblica del logotipo"),
            ("company.legalName", "GH Contadores & Asociados", "Empresa", "RazÃ³n social"),
            ("company.address", "Ruta Nacional Secundaria 155, Huacas, Santa Cruz, Guanacaste, Costa Rica", "Empresa", "DirecciÃ³n fÃ­sica"),
            ("company.phone1", "+506 2653 6634", "Empresa", "TelÃ©fono principal"),
            ("company.phone2", "+506 8846 9454", "Empresa", "TelÃ©fono secundario / WhatsApp"),
            ("company.email", "gustavo.ghcontadores@outlook.com", "Empresa", "Correo de direcciÃ³n"),
            ("company.supportEmail", "pedidos@ghcontadores.net", "Empresa", "Correo de soporte y pedidos"),
            ("company.website", "https://www.ghcontadores.net", "Empresa", "Sitio web actual"),
            ("company.country", "Costa Rica", "Empresa", "PaÃ­s de operaciÃ³n"),
            ("company.timeZone", "America/Costa_Rica", "Empresa", "Zona horaria"),
            ("sales.baseCurrency", "USD", "Ventas", "Moneda base del catÃ¡logo"),
            ("sales.secondaryCurrency", "CRC", "Ventas", "Moneda local para referencia"),
            ("sales.usdToCrc", "520", "Ventas", "Tipo de cambio USD â†’ CRC"),
            ("sales.defaultTaxRate", "0", "Ventas", "Impuesto por defecto en porcentaje"),
            ("sales.quoteValidityDays", "15", "Ventas", "Vigencia de una cotizaciÃ³n en dÃ­as"),
            ("payments.provider", "GH-Simulated", "Pagos", "Pasarela de pago activa (demostraciÃ³n)"),
            ("payments.testCardApproved", "4242 4242 4242 4242", "Pagos", "Tarjeta de prueba: aprobada"),
            ("payments.testCardDeclined", "4000 0000 0000 0002", "Pagos", "Tarjeta de prueba: rechazada"),
            ("payments.testCardPending", "4000 0000 0000 9995", "Pagos", "Tarjeta de prueba: pendiente"),
            ("notifications.reminderDaysBeforeDue", "3", "Notificaciones", "DÃ­as de antelaciÃ³n del recordatorio de vencimiento"),
            ("notifications.welcomeMessage", "Su cuenta fue aprobada. Ya puede consultar sus expedientes y documentos.", "Notificaciones", "Mensaje de bienvenida"),
            ("cases.defaultProgress", "0", "Expedientes", "Progreso inicial de un expediente"),
            ("catalog.sourceUrl", "https://www.ghcontadores.net/category/servicios", "CatÃ¡logo", "Origen de la migraciÃ³n del catÃ¡logo"),
        };

        var existing = await db.Settings.Select(s => s.Key).ToListAsync(ct);
        var set = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var d in defaults)
        {
            if (set.Contains(d.Key)) continue;
            db.Settings.Add(new Setting { Key = d.Key, Value = d.Value, Group = d.Group, Description = d.Description, UpdatedAt = DateTime.UtcNow });
        }
        await db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------ catÃ¡logo
    private sealed record CatalogFile(List<CatalogCategory> Categories, List<CatalogProduct> Products);
    private sealed record CatalogCategory(string Slug, string Name, string? Description, string? Icon, int Order);
    private sealed record CatalogProduct(
        string Slug, string Sku, string Name, decimal Price, string Currency, string CategorySlug,
        string? ShortDescription, string? Description, string? ImageUrl, bool IsFeatured, bool RequiresCase,
        int? EstimatedDays, string? SourceUrl);

    private static async Task SeedCatalogAsync(GhDbContext db, ILogger logger, string? catalogPath, CancellationToken ct)
    {
        if (await db.Products.AnyAsync(ct)) return;
        if (string.IsNullOrWhiteSpace(catalogPath) || !File.Exists(catalogPath))
        {
            logger.LogWarning("No se encontrÃ³ el archivo de catÃ¡logo ({Path}); se omite la migraciÃ³n de servicios.", catalogPath);
            return;
        }

        CatalogFile? file;
        try
        {
            var json = await File.ReadAllTextAsync(catalogPath, ct);
            file = JsonSerializer.Deserialize<CatalogFile>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "No se pudo leer el catÃ¡logo de migraciÃ³n.");
            return;
        }
        if (file is null) return;

        var categoryMap = new Dictionary<string, ProductCategory>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in file.Categories.OrderBy(c => c.Order))
        {
            var entity = await db.ProductCategories.FirstOrDefaultAsync(x => x.Slug == c.Slug, ct);
            if (entity is null)
            {
                entity = new ProductCategory
                {
                    Slug = c.Slug,
                    Name = c.Name,
                    Description = c.Description,
                    IconName = c.Icon,
                    SortOrder = c.Order,
                    IsActive = true,
                };
                db.ProductCategories.Add(entity);
                await db.SaveChangesAsync(ct);
            }
            categoryMap[c.Slug] = entity;
        }

        var added = 0;
        var sort = 0;
        // El SKU es Ãºnico en la base: se reserva en memoria y se comprueba contra la BD
        // para que un catÃ¡logo con SKU repetidos (o parcialmente sembrado) nunca rompa el arranque.
        var usedSkus = (await db.Products.Select(p => p.Sku).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingSlugs = (await db.Products.Select(p => p.Slug).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var p in file.Products)
        {
            if (!categoryMap.TryGetValue(p.CategorySlug, out var category)) continue;
            if (existingSlugs.Contains(p.Slug)) continue;

            var sku = string.IsNullOrWhiteSpace(p.Sku) ? $"GH-{Guid.NewGuid():N}"[..12].ToUpperInvariant() : p.Sku.Trim();
            if (usedSkus.Contains(sku))
            {
                var suffix = 2;
                var candidate = $"{sku}-{suffix}";
                while (usedSkus.Contains(candidate)) candidate = $"{sku}-{++suffix}";
                sku = candidate;
            }
            usedSkus.Add(sku);

            sort++;
            db.Products.Add(new Product
            {
                Sku = sku,
                Slug = p.Slug,
                Name = p.Name,
                ShortDescription = p.ShortDescription,
                Description = p.Description,
                Price = p.Price,
                Currency = string.IsNullOrWhiteSpace(p.Currency) ? "USD" : p.Currency,
                TaxRate = 0,
                CategoryId = category.Id,
                ImageUrl = p.ImageUrl,
                IsActive = true,
                IsFeatured = p.IsFeatured,
                RequiresCase = p.RequiresCase,
                DeliveryMode = DeliveryMode.Mixto,
                EstimatedDays = p.EstimatedDays ?? EstimateDays(p.Name),
                SortOrder = sort,
                SourceUrl = p.SourceUrl,
                SeoTitle = p.Name,
                SeoDescription = p.ShortDescription,
            });
            added++;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("CatÃ¡logo migrado: {Added} servicios en {Categories} categorÃ­as.", added, categoryMap.Count);
    }

    private static int EstimateDays(string name)
    {
        var n = name.ToLowerInvariant();
        if (n.Contains("mensual") || n.Contains("trimestral")) return 5;
        if (n.Contains("anual") || n.Contains("cierre fiscal") || n.Contains("estados financieros")) return 10;
        if (n.Contains("patente") || n.Contains("licores") || n.Contains("municipal")) return 15;
        if (n.Contains("declaraci")) return 3;
        if (n.Contains("constancia") || n.Contains("certificaci")) return 7;
        return 10;
    }

    // ------------------------------------------------------------------ demo CRM
    private static async Task SeedDemoClientAsync(GhDbContext db, ILogger logger, CancellationToken ct)
    {
        const string demoEmail = "cliente@demo.cr";
        if (await db.Users.AnyAsync(u => u.Email == demoEmail, ct)) return;

        // Se usan los mismos generadores que la aplicaciÃ³n para que los cÃ³digos de
        // demostraciÃ³n no choquen nunca con los que se creen despuÃ©s.
        var codes = new CodeGenerator(db, new DateTimeProvider());

        var hasher = new PasswordHasher<User>();
        var clientRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "Cliente", ct);
        var lawyer = await db.Users.FirstOrDefaultAsync(u => u.Email == "abogado@ghcontadores.net", ct);
        var accountant = await db.Users.FirstOrDefaultAsync(u => u.Email == "contador@ghcontadores.net", ct);
        var admin = await db.Users.FirstOrDefaultAsync(u => u.Email == "admin@ghcontadores.net", ct);

        var client = new Client
        {
            Code = await codes.NextClientCodeAsync(ct),
            ClientType = ClientType.Company,
            LegalName = "Inversiones PacÃ­fico Azul S.A.",
            TradeName = "PacÃ­fico Azul",
            IdNumber = "3-101-789456",
            Email = demoEmail,
            Phone = "+506 8888 1122",
            Whatsapp = "+506 8888 1122",
            Address = "150 m oeste del Banco Nacional, Huacas, Santa Cruz",
            Province = "Guanacaste",
            Canton = "Santa Cruz",
            District = "Huacas",
            Country = "Costa Rica",
            Status = ClientStatus.Active,
            Source = ClientSource.App,
            AssignedToUserId = lawyer?.Id ?? admin?.Id,
            TagsCsv = "extranjero,restaurante,prioritario",
            Notes = "Sociedad de inversionistas extranjeros con restaurante en Guanacaste. Requiere contabilidad mensual, patente comercial y declaraciones mensuales.",
            LastContactAt = DateTime.UtcNow.AddDays(-2),
        };
        db.Clients.Add(client);
        await db.SaveChangesAsync(ct);

        var user = new User
        {
            Email = demoEmail,
            FullName = "SofÃ­a RamÃ­rez Cordero",
            Phone = "+506 8888 1122",
            IdNumber = "3-101-789456",
            Status = UserStatus.Active,
            IsStaff = false,
            ClientId = client.Id,
            LastLoginAt = DateTime.UtcNow.AddHours(-6),
        };
        user.PasswordHash = hasher.HashPassword(user, "Gh.Cliente2026");
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        client.UserId = user.Id;
        if (clientRole is not null)
            db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = clientRole.Id });

        db.ClientContacts.Add(new ClientContact
        {
            ClientId = client.Id,
            FullName = "SofÃ­a RamÃ­rez Cordero",
            Position = "Representante legal",
            Email = demoEmail,
            Phone = "+506 8888 1122",
            IsPrimary = true,
        });

        db.ClientInteractions.AddRange(
            new ClientInteraction
            {
                ClientId = client.Id,
                Type = InteractionType.Call,
                Subject = "Llamada de seguimiento de patente comercial",
                Notes = "Se confirmÃ³ el estado del trÃ¡mite ante la Municipalidad de Santa Cruz.",
                OccurredAt = DateTime.UtcNow.AddDays(-2),
                IsCompleted = true,
                CreatedByUserId = lawyer?.Id,
            },
            new ClientInteraction
            {
                ClientId = client.Id,
                Type = InteractionType.Note,
                Subject = "Pendiente: cÃ©dula jurÃ­dica actualizada",
                Notes = "Solicitar la personerÃ­a jurÃ­dica actualizada para el trÃ¡mite municipal.",
                OccurredAt = DateTime.UtcNow.AddDays(-1),
                ReminderAt = DateTime.UtcNow.AddDays(2),
                CreatedByUserId = admin?.Id,
            });

        // --- Expedientes
        var case1 = new CaseFile
        {
            Code = await codes.NextCaseCodeAsync(ct),
            ClientId = client.Id,
            Title = "Contabilidad mensual y declaraciones de IVA",
            Description = "Servicio contable recurrente: registro de operaciones, conciliaciones, declaraciÃ³n mensual de IVA (D-104) y estados financieros.",
            Matter = CaseMatter.Contable,
            Entity = CaseEntity.ATV,
            ReferenceNumber = "D-104-2026-0087",
            Status = CaseStatus.InProgress,
            Priority = Priority.High,
            ProgressPercent = 45,
            ResponsibleUserId = accountant?.Id ?? admin?.Id,
            OpenedAt = DateTime.UtcNow.AddDays(-40),
            DueAt = DateTime.UtcNow.AddDays(6),
            AgreedAmount = 169.50m,
            Currency = "USD",
            Source = CaseFileSource.Manual,
        };
        var case2 = new CaseFile
        {
            Code = await codes.NextCaseCodeAsync(ct),
            ClientId = client.Id,
            Title = "RenovaciÃ³n de patente comercial - Municipalidad de Santa Cruz",
            Description = "TrÃ¡mite municipal de renovaciÃ³n de patente comercial del local en Huacas, incluye estado de cuenta y pago de impuestos.",
            Matter = CaseMatter.Municipal,
            Entity = CaseEntity.Municipalidad,
            ReferenceNumber = "MUN-SC-2026-4412",
            Status = CaseStatus.WaitingClient,
            Priority = Priority.Normal,
            ProgressPercent = 60,
            ResponsibleUserId = lawyer?.Id ?? admin?.Id,
            OpenedAt = DateTime.UtcNow.AddDays(-22),
            DueAt = DateTime.UtcNow.AddDays(14),
            AgreedAmount = 339m,
            Currency = "USD",
            Source = CaseFileSource.Order,
        };
        db.CaseFiles.AddRange(case1, case2);
        await db.SaveChangesAsync(ct);

        // --- Tareas
        db.CaseTasks.AddRange(
            new CaseTask
            {
                CaseFileId = case1.Id, Title = "Registrar facturas del perÃ­odo", Status = TaskStatus.Done,
                Priority = Priority.High, DueAt = DateTime.UtcNow.AddDays(-10), CompletedAt = DateTime.UtcNow.AddDays(-9),
                AssignedToUserId = accountant?.Id, CreatedByUserId = accountant?.Id, SortOrder = 1, ClientVisible = true,
            },
            new CaseTask
            {
                CaseFileId = case1.Id, Title = "ConciliaciÃ³n bancaria mensual", Status = TaskStatus.InProgress,
                Priority = Priority.High, DueAt = DateTime.UtcNow.AddDays(2), AssignedToUserId = accountant?.Id,
                CreatedByUserId = accountant?.Id, SortOrder = 2, ClientVisible = true,
            },
            new CaseTask
            {
                CaseFileId = case1.Id, Title = "Presentar declaraciÃ³n D-104", Status = TaskStatus.Todo,
                Priority = Priority.Urgent, DueAt = DateTime.UtcNow.AddDays(5), AssignedToUserId = accountant?.Id,
                CreatedByUserId = accountant?.Id, SortOrder = 3, ClientVisible = true, ClientCanComplete = false,
            },
            new CaseTask
            {
                CaseFileId = case2.Id, Title = "Cargar personerÃ­a jurÃ­dica actualizada", Status = TaskStatus.Todo,
                Description = "Documento requerido por la municipalidad para continuar el trÃ¡mite.",
                Priority = Priority.High, DueAt = DateTime.UtcNow.AddDays(3), AssignedToUserId = user.Id,
                CreatedByUserId = lawyer?.Id, SortOrder = 1, ClientVisible = true, ClientCanComplete = true,
            },
            new CaseTask
            {
                CaseFileId = case2.Id, Title = "Pago de impuestos municipales", Status = TaskStatus.Todo,
                Priority = Priority.Normal, DueAt = DateTime.UtcNow.AddDays(10), AssignedToUserId = lawyer?.Id,
                CreatedByUserId = lawyer?.Id, SortOrder = 2, ClientVisible = true,
            });

        // --- Actuaciones (timeline)
        db.CaseEvents.AddRange(
            new CaseEvent { CaseFileId = case1.Id, Type = CaseEventType.Created, Title = "Expediente creado", Description = "Se abriÃ³ el expediente de contabilidad mensual.", ActorName = "Sistema", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-40) },
            new CaseEvent { CaseFileId = case1.Id, Type = CaseEventType.StatusChanged, Title = "Estado actualizado a En proceso", ActorName = "CPA AndrÃ©s Vargas Mora", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-38) },
            new CaseEvent { CaseFileId = case1.Id, Type = CaseEventType.TaskCompleted, Title = "Tarea completada: Registrar facturas del perÃ­odo", ActorName = "CPA AndrÃ©s Vargas Mora", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-9) },
            new CaseEvent { CaseFileId = case1.Id, Type = CaseEventType.Note, Title = "Se solicitÃ³ el auxiliar de bancos de enero", ActorName = "CPA AndrÃ©s Vargas Mora", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-4) },
            new CaseEvent { CaseFileId = case2.Id, Type = CaseEventType.Created, Title = "Expediente creado desde el pedido GH-ORD-" + DateTime.UtcNow.Year + "-00001", ActorName = "Sistema", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-22) },
            new CaseEvent { CaseFileId = case2.Id, Type = CaseEventType.StatusChanged, Title = "Estado actualizado a En espera del cliente", ActorName = "Lic. Mariana SolÃ­s Rojas", ClientVisible = true, CreatedAt = DateTime.UtcNow.AddDays(-3) });

        // --- MensajerÃ­a
        db.Messages.AddRange(
            new Message
            {
                ClientId = client.Id, CaseFileId = case2.Id, SenderUserId = lawyer?.Id ?? admin!.Id,
                SenderName = "Lic. Mariana SolÃ­s Rojas", IsFromClient = false,
                Body = "Buenos dÃ­as. Para continuar con la renovaciÃ³n de la patente necesitamos la personerÃ­a jurÃ­dica actualizada. Puede subirla desde la secciÃ³n Documentos del app.",
                CreatedAt = DateTime.UtcNow.AddDays(-3), ReadByClientAt = DateTime.UtcNow.AddDays(-3),
            },
            new Message
            {
                ClientId = client.Id, CaseFileId = case2.Id, SenderUserId = user.Id,
                SenderName = "SofÃ­a RamÃ­rez Cordero", IsFromClient = true,
                Body = "Perfecto, la subo hoy mismo. Â¿Algo mÃ¡s que necesiten?",
                CreatedAt = DateTime.UtcNow.AddDays(-2).AddHours(-3), ReadByStaffAt = DateTime.UtcNow.AddDays(-2),
            });

        // --- Pedido de demo con pago aprobado
        var product = await db.Products.OrderBy(p => p.SortOrder).FirstOrDefaultAsync(p => p.RequiresCase, ct);
        if (product is not null)
        {
            var order = new Order
            {
                Number = await codes.NextOrderNumberAsync(ct),
                UserId = user.Id,
                ClientId = client.Id,
                Status = OrderStatus.Paid,
                Subtotal = product.Price,
                Tax = 0,
                Total = product.Price,
                Currency = product.Currency,
                CustomerName = client.LegalName,
                CustomerEmail = demoEmail,
                CustomerPhone = client.Phone,
                RequiresInvoice = true,
                PaidAt = DateTime.UtcNow.AddDays(-22),
                CreatedAt = DateTime.UtcNow.AddDays(-23),
            };
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);

            db.OrderItems.Add(new OrderItem
            {
                OrderId = order.Id, ProductId = product.Id, NameSnapshot = product.Name,
                UnitPrice = product.Price, Quantity = 1, Total = product.Price, CaseFileId = case2.Id,
            });

            db.Payments.Add(new Payment
            {
                OrderId = order.Id,
                Provider = PaymentGatewaySimulator.Provider,
                Method = PaymentMethod.Card,
                Status = PaymentStatus.Approved,
                Amount = order.Total,
                Currency = order.Currency,
                Reference = "SIM-DEMO-000001",
                AuthorizationCode = "481207",
                CardBrand = "Visa",
                CardLast4 = "4242",
                CardHolder = "SofÃ­a RamÃ­rez Cordero",
                ProcessedAt = DateTime.UtcNow.AddDays(-22),
                RawResponseJson = "{\"status\":\"APPROVED\",\"code\":\"00\"}",
            });
        }

        // --- Solicitud de cuenta pendiente (para que el admin la vea desde el primer arranque)
        db.AccountRequests.Add(new AccountRequest
        {
            FullName = "Carlos Mendoza Quesada",
            Email = "carlos.mendoza@ejemplo.cr",
            Phone = "+506 8712 3456",
            IdNumber = "1-1234-5678",
            ClientType = ClientType.Individual,
            Company = "Consultores Mendoza",
            Message = "Necesito contabilidad mensual y declaraciÃ³n de IVA para mi negocio de servicios digitales.",
            Source = AccountRequestSource.App,
            Status = AccountRequestStatus.Pending,
            TrackingCode = await codes.NextTrackingCodeAsync(ct),
            CreatedAt = DateTime.UtcNow.AddHours(-8),
        });

        db.QuoteRequests.Add(new QuoteRequest
        {
            FullName = "Ana LucÃ­a Brenes",
            Email = "ana.brenes@ejemplo.cr",
            Phone = "+506 8899 7766",
            Company = "Brenes & Inversiones",
            Message = "Quisiera una cotizaciÃ³n para constituir una sociedad y abrir la cuenta bancaria.",
            Status = QuoteStatus.New,
            CreatedAt = DateTime.UtcNow.AddDays(-1),
        });

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Datos de demostraciÃ³n creados: cliente {Client} con 2 expedientes.", client.Code);
    }
}
