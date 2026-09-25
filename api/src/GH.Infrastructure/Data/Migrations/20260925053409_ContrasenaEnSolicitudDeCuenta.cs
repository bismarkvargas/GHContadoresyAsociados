using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GH.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class ContrasenaEnSolicitudDeCuenta : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "AccountRequests",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "AccountRequests");
        }
    }
}
