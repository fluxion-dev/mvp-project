using mvp_server.Data;
using mvp_server.Models;

public static class DbInitializer
{
    public static void Initialize(AppDbContext context)
    {
        context.Database.EnsureCreated();

        // Look for any streams.
        if (context.Streams.Any())
        {
            return; // DB has been seeded
        }

        // Seed some initial streams
        var streams = new Stream[]
        {
            new Stream { Name = "General", ActivityLevel = 5 },
            new Stream = new Stream { Name = "Announcements", ActivityLevel = 3 },
            new Stream = new Stream { Name = "Off-Topic", ActivityLevel = 1 }
        };

        foreach (var stream in streams)
        {
            context.Streams.Add(stream);
        }
        context.SaveChanges();
    }
}
