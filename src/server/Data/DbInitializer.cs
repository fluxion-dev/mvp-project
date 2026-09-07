namespace mvp_server;

using mvp_server.Data;
using mvp_server.Models;
using Microsoft.AspNetCore.Identity;
using System.Linq;

public static class DbInitializer
{
    public static void Initialize(AppDbContext context)
    {
        context.Database.EnsureCreated();

        // Seed roles directly through the context
        if (!context.Roles.Any())
        {
            var adminRole = new IdentityRole<Guid> { Name = "Admin", NormalizedName = "ADMIN" };
            var userRole = new IdentityRole<Guid> { Name = "User", NormalizedName = "USER" };
            context.Roles.AddRange(adminRole, userRole);
            context.SaveChanges();
        }

        // Look for any streams.
        if (context.Streams.Any())
        {
            return; // DB has been seeded
        }

        // Seed some initial streams
        var streams = new Stream[]
        {
            new Stream { Name = "General", ActivityLevel = 5 },
            new Stream { Name = "Announcements", ActivityLevel = 3 },
            new Stream { Name = "Off-Topic", ActivityLevel = 1 }
        };

        foreach (var stream in streams)
        {
            context.Streams.Add(stream);
        }
        context.SaveChanges();
    }
}