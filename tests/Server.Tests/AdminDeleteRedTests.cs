// RED tests for issues #9 + #10 — AdminController.DeleteStream / DeleteMessage.
// Auth decision (documented): keep admin deletes ANON for MVP (no [Authorize(Roles=Admin)]).
// Rationale: JWT has no role claim, so [Authorize(Roles=Admin)] would 403 everyone, breaking.
// Full admin authZ (role claims + policy) is deferred post-MVP.
// Test-infra choice (mirrors PostMessageRedTests/GetMessagesRedTests): controller unit tests
// with EF Core InMemory AppDbContext, direct instantiation (UserManager=null! — unused by
// delete paths), NOT WebApplicationFactory. Rationale: Program.cs top-level statements,
// Npgsql/Postgres wiring — same as prior RED suites.

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using Xunit;

namespace Server.Tests;

public class AdminDeleteRedTests
{
    private static AppDbContext CreateDbContext(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static AdminController CreateController(AppDbContext ctx) =>
        new AdminController(ctx, null!);

    private static Guid SeedStream(AppDbContext ctx, string name = "general")
    {
        var streamId = Guid.NewGuid();
        ctx.Streams.Add(new mvp_server.Models.Stream
        {
            Id = streamId,
            Name = name,
            ActivityLevel = 0,
            CreatedAt = DateTime.UtcNow
        });
        ctx.SaveChanges();
        return streamId;
    }

    private static Guid SeedMessage(AppDbContext ctx, Guid streamId, string content = "hello")
    {
        var messageId = Guid.NewGuid();
        ctx.Messages.Add(new mvp_server.Models.Message
        {
            Id = messageId,
            Content = content,
            CreatedAt = DateTime.UtcNow,
            StreamId = streamId,
            UserId = null
        });
        ctx.SaveChanges();
        return messageId;
    }

    [Fact]
    public async Task DeleteStream_Existing_Returns200()
    {
        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var controller = CreateController(ctx);

        var result = await controller.DeleteStream(streamId);

        Assert.IsType<OkObjectResult>(result);
        Assert.Null(await ctx.Streams.FindAsync(streamId));
    }

    [Fact]
    public async Task DeleteStream_Unknown_Returns404()
    {
        using var ctx = CreateDbContext();
        SeedStream(ctx);
        var controller = CreateController(ctx);

        var result = await controller.DeleteStream(Guid.NewGuid());

        Assert.True(result is NotFoundResult or NotFoundObjectResult,
            $"RED: expected 404 for unknown streamId, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task DeleteStream_WithMessages_CascadesMessages()
    {
        // Simulate Postgres FK (Restrict/NoAction): seed in one context, delete in a
        // fresh context where messages are NOT tracked. InMemory auto-cascades only
        // tracked dependents, so without explicit RemoveRange the orphans remain —
        // mirroring the Postgres FK violation. Green must query + RemoveRange.
        var dbName = Guid.NewGuid().ToString();
        Guid streamId;
        using (var seedCtx = CreateDbContext(dbName))
        {
            streamId = SeedStream(seedCtx);
            SeedMessage(seedCtx, streamId, "one");
            SeedMessage(seedCtx, streamId, "two");
        }

        using (var ctx = CreateDbContext(dbName))
        {
            var controller = CreateController(ctx);

            var result = await controller.DeleteStream(streamId);

            Assert.IsType<OkObjectResult>(result);
            Assert.Null(await ctx.Streams.FindAsync(streamId));
        }

        using (var verifyCtx = CreateDbContext(dbName))
        {
            Assert.Empty(verifyCtx.Messages.Where(m => m.StreamId == streamId));
        }
    }

    [Fact]
    public async Task DeleteMessage_Existing_Returns200()
    {
        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var messageId = SeedMessage(ctx, streamId);
        var controller = CreateController(ctx);

        var result = await controller.DeleteMessage(messageId);

        Assert.IsType<OkObjectResult>(result);
        Assert.Null(await ctx.Messages.FindAsync(messageId));
    }

    [Fact]
    public async Task DeleteMessage_Unknown_Returns404()
    {
        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        SeedMessage(ctx, streamId);
        var controller = CreateController(ctx);

        var result = await controller.DeleteMessage(Guid.NewGuid());

        Assert.True(result is NotFoundResult or NotFoundObjectResult,
            $"RED: expected 404 for unknown messageId, got {(result == null ? "null" : result.GetType().Name)}.");
    }
}
