using Microsoft.AspNetCore.Builder;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

public static class ObservabilityExtensions
{
    public static IServiceCollection AddMvpObservability(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOpenTelemetry()
            .WithTracing(builder => builder
                .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService("mvp-api"))
                .AddAspNetCoreInstrumentation()
                .AddNpgsqlInstrumentation(options =>
                {
                    options.ConnectionString = configuration.GetConnectionString("DefaultConnection")!;
                })
                .AddConsoleExporter());

        return services;
    }

    public static IApplicationBuilder UseMvpObservability(this IApplicationBuilder app)
    {
        // OpenTelemetry middleware would be here
        return app;
    }
}
