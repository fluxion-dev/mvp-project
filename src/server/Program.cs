using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

// Serilog configuration
Log.Logger = new LoggerConfiguration()
  .WriteTo.Console()
  .WriteTo.PostgreSQL(
    connectionString: builder.Configuration.GetConnectionString("DefaultConnection"),
    tableName: "LogEvents"
  )
  .CreateLogger();

builder.Host.UseSerilog();

builder.Services.AddOpenTelemetry()
  .WithTracing(builder => builder
    .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService("mvp-api"))
    .AddSource("Microsoft.AspNetCore")
    .AddNpgsqlStateTracking(
      builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddDbContext<AppDbContext>(options =>
  options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
  .AddEntityFrameworkStores<AppDbContext>()
  .AddDefaultTokenProviders();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
