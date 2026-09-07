using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

public static class ObservabilityExtensions
{
    public static IServiceCollection AddMvpObservability(this IServiceCollection services, IConfiguration configuration)
    {
        // Observability services configured via Serilog
        return services;
    }

    public static IApplicationBuilder UseMvpObservability(this IApplicationBuilder app)
    {
        return app;
    }
}