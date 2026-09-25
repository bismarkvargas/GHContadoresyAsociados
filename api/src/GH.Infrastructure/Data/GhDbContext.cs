using GH.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GH.Infrastructure.Data;

public class GhDbContext : DbContext
{
    public GhDbContext(DbContextOptions<GhDbContext> options) : base(options) { }

    // Identidad
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<DeviceToken> DeviceTokens => Set<DeviceToken>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<AccountRequest> AccountRequests => Set<AccountRequest>();

    // CRM y expedientes
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<ClientContact> ClientContacts => Set<ClientContact>();
    public DbSet<ClientInteraction> ClientInteractions => Set<ClientInteraction>();
    public DbSet<CaseFile> CaseFiles => Set<CaseFile>();
    public DbSet<CaseTask> CaseTasks => Set<CaseTask>();
    public DbSet<CaseEvent> CaseEvents => Set<CaseEvent>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Document> Documents => Set<Document>();

    // Catálogo y venta
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPrice> ProductPrices => Set<ProductPrice>();
    public DbSet<Cart> Carts => Set<Cart>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();

    // Soporte
    public DbSet<QuoteRequest> QuoteRequests => Set<QuoteRequest>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<EntityCounter> EntityCounters => Set<EntityCounter>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => new { x.Status, x.IsStaff });
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.PasswordHash).HasMaxLength(512).IsRequired();
            e.Property(x => x.Phone).HasMaxLength(40);
            e.Property(x => x.IdNumber).HasMaxLength(40);
            e.Property(x => x.Locale).HasMaxLength(10);
            e.Property(x => x.TimeZone).HasMaxLength(60);
            e.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Role>(e =>
        {
            e.ToTable("Roles");
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).HasMaxLength(80).IsRequired();
        });

        b.Entity<Permission>(e =>
        {
            e.ToTable("Permissions");
            e.HasIndex(x => x.Code).IsUnique();
            e.Property(x => x.Code).HasMaxLength(120).IsRequired();
            e.Property(x => x.Module).HasMaxLength(60).IsRequired();
            e.Property(x => x.Action).HasMaxLength(40).IsRequired();
        });

        b.Entity<UserRole>(e =>
        {
            e.ToTable("UserRoles");
            e.HasKey(x => new { x.UserId, x.RoleId });
            e.HasOne(x => x.User).WithMany(u => u.UserRoles).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Role).WithMany(r => r.UserRoles).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<RolePermission>(e =>
        {
            e.ToTable("RolePermissions");
            e.HasKey(x => new { x.RoleId, x.PermissionId });
            e.HasOne(x => x.Role).WithMany(r => r.RolePermissions).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Permission).WithMany(p => p.RolePermissions).HasForeignKey(x => x.PermissionId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<RefreshToken>(e =>
        {
            e.ToTable("RefreshTokens");
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();
            e.HasOne(x => x.User).WithMany(u => u.RefreshTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<DeviceToken>(e =>
        {
            e.ToTable("DeviceTokens");
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Token).HasMaxLength(512).IsRequired();
            e.HasOne(x => x.User).WithMany(u => u.DeviceTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<NotificationPreference>(e =>
        {
            e.ToTable("NotificationPreferences");
            e.HasIndex(x => new { x.UserId, x.Type }).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<AccountRequest>(e =>
        {
            e.ToTable("AccountRequests");
            e.HasIndex(x => x.Email);
            e.HasIndex(x => x.TrackingCode).IsUnique();
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.Property(x => x.Phone).HasMaxLength(40).IsRequired();
            e.Property(x => x.TrackingCode).HasMaxLength(24).IsRequired();
            e.HasOne(x => x.ReviewedByUser).WithMany().HasForeignKey(x => x.ReviewedByUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.CreatedUser).WithMany().HasForeignKey(x => x.CreatedUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.CreatedClient).WithMany().HasForeignKey(x => x.CreatedClientId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Client>(e =>
        {
            e.ToTable("Clients");
            e.HasIndex(x => x.Code).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => new { x.Status, x.AssignedToUserId });
            e.HasIndex(x => x.LegalName);
            e.HasIndex(x => x.IdNumber);
            e.Property(x => x.Code).HasMaxLength(32).IsRequired();
            e.Property(x => x.LegalName).HasMaxLength(200).IsRequired();
            e.Property(x => x.TradeName).HasMaxLength(200);
            e.Property(x => x.IdNumber).HasMaxLength(40);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Phone).HasMaxLength(40);
            e.Property(x => x.Whatsapp).HasMaxLength(40);
            e.HasOne(x => x.AssignedToUser).WithMany().HasForeignKey(x => x.AssignedToUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ClientContact>(e =>
        {
            e.ToTable("ClientContacts");
            e.HasOne(x => x.Client).WithMany(c => c.Contacts).HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ClientInteraction>(e =>
        {
            e.ToTable("ClientInteractions");
            e.HasIndex(x => new { x.ClientId, x.OccurredAt });
            e.HasOne(x => x.Client).WithMany(c => c.Interactions).HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<CaseFile>(e =>
        {
            e.ToTable("CaseFiles");
            e.HasIndex(x => x.Code).IsUnique();
            e.HasIndex(x => new { x.ClientId, x.Status });
            e.HasIndex(x => x.DueAt);
            e.Property(x => x.Code).HasMaxLength(32).IsRequired();
            e.Property(x => x.Title).HasMaxLength(240).IsRequired();
            e.Property(x => x.AgreedAmount).HasPrecision(12, 2);
            e.HasOne(x => x.Client).WithMany(c => c.CaseFiles).HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ResponsibleUser).WithMany().HasForeignKey(x => x.ResponsibleUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<CaseTask>(e =>
        {
            e.ToTable("CaseTasks");
            e.HasIndex(x => new { x.CaseFileId, x.Status });
            e.HasIndex(x => new { x.DueAt, x.Status });
            e.Property(x => x.Title).HasMaxLength(240).IsRequired();
            e.HasOne(x => x.CaseFile).WithMany(c => c.Tasks).HasForeignKey(x => x.CaseFileId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AssignedToUser).WithMany().HasForeignKey(x => x.AssignedToUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<CaseEvent>(e =>
        {
            e.ToTable("CaseEvents");
            e.HasIndex(x => new { x.CaseFileId, x.CreatedAt });
            e.Property(x => x.Title).HasMaxLength(240).IsRequired();
            e.HasOne(x => x.CaseFile).WithMany(c => c.Events).HasForeignKey(x => x.CaseFileId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ActorUser).WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Message>(e =>
        {
            e.ToTable("Messages");
            e.HasIndex(x => new { x.ClientId, x.CreatedAt });
            e.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.CaseFile).WithMany(c => c.Messages).HasForeignKey(x => x.CaseFileId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.SenderUser).WithMany().HasForeignKey(x => x.SenderUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AttachmentDocument).WithMany().HasForeignKey(x => x.AttachmentDocumentId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Document>(e =>
        {
            e.ToTable("Documents");
            e.HasIndex(x => x.CaseFileId);
            e.HasIndex(x => x.ClientId);
            e.HasIndex(x => x.OrderId);
            e.Property(x => x.FileName).HasMaxLength(300).IsRequired();
            e.Property(x => x.OriginalName).HasMaxLength(300).IsRequired();
            e.Property(x => x.ContentType).HasMaxLength(120);
            e.Property(x => x.StoragePath).HasMaxLength(500).IsRequired();
            e.Property(x => x.Sha256).HasMaxLength(64);
            e.HasOne(x => x.Client).WithMany(c => c.Documents).HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.CaseFile).WithMany(c => c.Documents).HasForeignKey(x => x.CaseFileId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.UploadedByUser).WithMany().HasForeignKey(x => x.UploadedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ProductCategory>(e =>
        {
            e.ToTable("ProductCategories");
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            e.Property(x => x.Name).HasMaxLength(160).IsRequired();
        });

        b.Entity<Product>(e =>
        {
            e.ToTable("Products");
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.Sku).IsUnique();
            e.HasIndex(x => new { x.CategoryId, x.IsActive });
            e.Property(x => x.Sku).HasMaxLength(48).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(200).IsRequired();
            e.Property(x => x.Name).HasMaxLength(240).IsRequired();
            e.Property(x => x.Price).HasPrecision(12, 2);
            e.Property(x => x.TaxRate).HasPrecision(5, 2);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasOne(x => x.Category).WithMany(c => c.Products).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<ProductPrice>(e =>
        {
            e.ToTable("ProductPrices");
            e.Property(x => x.Price).HasPrecision(12, 2);
            e.HasOne(x => x.Product).WithMany(p => p.PriceHistory).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Cart>(e =>
        {
            e.ToTable("Carts");
            e.HasIndex(x => new { x.UserId, x.Status });
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<CartItem>(e =>
        {
            e.ToTable("CartItems");
            e.Property(x => x.UnitPrice).HasPrecision(12, 2);
            e.HasOne(x => x.Cart).WithMany(c => c.Items).HasForeignKey(x => x.CartId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Order>(e =>
        {
            e.ToTable("Orders");
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => new { x.UserId, x.Status });
            e.HasIndex(x => x.ClientId);
            e.Property(x => x.Number).HasMaxLength(32).IsRequired();
            e.Property(x => x.Subtotal).HasPrecision(12, 2);
            e.Property(x => x.Discount).HasPrecision(12, 2);
            e.Property(x => x.Tax).HasPrecision(12, 2);
            e.Property(x => x.Total).HasPrecision(12, 2);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Client).WithMany(c => c.Orders).HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<OrderItem>(e =>
        {
            e.ToTable("OrderItems");
            e.Property(x => x.UnitPrice).HasPrecision(12, 2);
            e.Property(x => x.Total).HasPrecision(12, 2);
            e.Property(x => x.NameSnapshot).HasMaxLength(240).IsRequired();
            e.HasOne(x => x.Order).WithMany(o => o.Items).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CaseFile).WithMany().HasForeignKey(x => x.CaseFileId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Payment>(e =>
        {
            e.ToTable("Payments");
            e.HasIndex(x => x.Reference).IsUnique();
            e.HasIndex(x => x.OrderId);
            e.Property(x => x.Reference).HasMaxLength(64).IsRequired();
            e.Property(x => x.Amount).HasPrecision(12, 2);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasOne(x => x.Order).WithMany(o => o.Payments).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<QuoteRequest>(e =>
        {
            e.ToTable("QuoteRequests");
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.Property(x => x.Phone).HasMaxLength(40).IsRequired();
            e.HasOne(x => x.Service).WithMany().HasForeignKey(x => x.ServiceId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.HandledByUser).WithMany().HasForeignKey(x => x.HandledByUserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Notification>(e =>
        {
            e.ToTable("Notifications");
            e.HasIndex(x => new { x.UserId, x.Status, x.CreatedAt });
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Body).HasMaxLength(1000).IsRequired();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<AuditLog>(e =>
        {
            e.ToTable("AuditLogs");
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => new { x.EntityName, x.EntityId });
            e.Property(x => x.Action).HasMaxLength(80).IsRequired();
            e.Property(x => x.EntityName).HasMaxLength(80).IsRequired();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Setting>(e =>
        {
            e.ToTable("Settings");
            e.HasKey(x => x.Key);
            // "Key" es palabra reservada en MySQL: se mapea a una columna segura.
            e.Property(x => x.Key).HasColumnName("SettingKey").HasMaxLength(120);
            e.Property(x => x.Group).HasMaxLength(60);
        });

        b.Entity<EntityCounter>(e =>
        {
            e.ToTable("EntityCounters");
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasColumnName("CounterKey").HasMaxLength(60);
        });
    }
}
