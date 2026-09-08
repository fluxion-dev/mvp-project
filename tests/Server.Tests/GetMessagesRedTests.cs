// RED tests for issue #8 — canonical GET /api/streams/{streamId:guid}/messages.
// Legacy route only at GET api/messages/stream/{streamId} (MessagesController); canonical missing.
//
// Auth decision (documented): keep canonical GET ANON (no [Authorize]) to match
// GET /api/streams list (anon). Rationale: reading messages is public like listing
// streams; POST remains [Authorize]. This test asserts NO [Authorize] on the action.
//
// Malformed-Guid decision (documented): route must constrain {streamId:guid} so the
// framework returns 400 before the action runs. Unit-level contract here is the
// ":guid" constraint on the HttpGet template; full 400-pipeline is framework behavior.
//
// Test-infra choice (documented, mirrors PostMessageRedTests): controller unit tests
// with EF Core InMemory AppDbContext + reflection lookup, NOT WebApplicationFactory.
// Rationale: Program.cs uses top-level statements with no `public partial class Program`,
// so WAF would require modifying Program.cs (out of scope for RED; no src changes allowed).
// Reflection lookup lets this file compile pre-Green; every test fails with RedMissingRoute
// until Green adds the action. Frontend api.ts getMessages() expects canonical GET
// returning Message[] with nested user { id, username } ideally — shape test asserts at
// least flat fields (Id/Content/CreatedAt/UserId/StreamId) and tolerates nested User if present.

using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using Xunit;

namespace Server.Tests;

public class GetMessagesRedTests
{
    private const string RedMissingRoute =
        "RED: canonical GET /api/streams/{streamId:guid}/messages not found on StreamController. " +
        "Green gap: add [HttpGet(\"{streamId:guid}/messages\")] anon action taking (Guid streamId), " +
        "404 on unknown stream, Where+OrderByDescending(CreatedAt) + Select to DTO with username via join, " +
        "AsNoTracking, 200 OK list (empty → []).";

    private static MethodInfo? FindCanonicalGetMethod()
    {
        return typeof(StreamController).GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m =>
            {
                var get = m.GetCustomAttribute<HttpGetAttribute>();
                if (get == null) return false;
                var template = get.Template ?? string.Empty;
                if (!template.Contains("messages", StringComparison.OrdinalIgnoreCase)) return false;
                var parameters = m.GetParameters();
                return parameters.Length == 1 && parameters[0].ParameterType == typeof(Guid);
            });
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

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

    private static void SeedMessage(AppDbContext ctx, Guid streamId, string content, DateTime createdAt, Guid? userId = null)
    {
        ctx.Messages.Add(new mvp_server.Models.Message
        {
            Id = Guid.NewGuid(),
            Content = content,
            CreatedAt = createdAt,
            StreamId = streamId,
            UserId = userId
        });
        ctx.SaveChanges();
    }

    private static async Task<object?> InvokeGetAsync(MethodInfo method, StreamController controller, Guid streamId)
    {
        var raw = method.Invoke(controller, new object[] { streamId });
        Assert.True(raw is Task, "RED: canonical GET action must be awaitable (Task<ActionResult<T>>).");
        await (Task)raw!;
        return raw.GetType().GetProperty("Result")?.GetValue(raw);
    }

    private static IActionResult? UnwrapActionResult(object? actionResult)
    {
        if (actionResult == null) return null;
        if (actionResult is IActionResult direct) return direct;
        return actionResult.GetType().GetProperty("Result")?.GetValue(actionResult) as IActionResult;
    }

    private static IEnumerable<object?> UnwrapListValues(object? actionResult)
    {
        if (actionResult == null) return [];
        // Direct Value on ActionResult<T> (e.g. ActionResult<IEnumerable<Dto>>.Value)
        var valueProp = actionResult.GetType().GetProperty("Value");
        var value = valueProp?.GetValue(actionResult);
        if (value is System.Collections.IEnumerable enumerable and not string)
            return enumerable.Cast<object?>();
        // Else unwrap inner IActionResult (OkObjectResult.Value)
        var inner = UnwrapActionResult(actionResult);
        if (inner is OkObjectResult ok && ok.Value is System.Collections.IEnumerable okEnum and not string)
            return okEnum.Cast<object?>();
        return [];
    }

    private static object? Prop(object? target, string name) =>
        target?.GetType().GetProperty(name,
            BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(target);

    [Fact]
    public async Task GetMessages_ExistingStreamWithMessages_Returns200ListWithDtoShape()
    {
        var method = FindCanonicalGetMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var now = DateTime.UtcNow;
        SeedMessage(ctx, streamId, "first", now.AddMinutes(-2));
        SeedMessage(ctx, streamId, "second", now.AddMinutes(-1));

        var controller = new StreamController(ctx);
        var actionResult = await InvokeGetAsync(method!, controller, streamId);
        var inner = UnwrapActionResult(actionResult);

        Assert.True(inner is OkObjectResult,
            $"RED: expected 200 OK (OkObjectResult), got {(inner == null ? "null" : inner.GetType().Name)}.");

        var items = UnwrapListValues(actionResult).ToList();
        Assert.Equal(2, items.Count);

        foreach (var item in items)
        {
            Assert.NotNull(item);
            Assert.True(Prop(item, "Id") is Guid id && id != Guid.Empty, "DTO must include non-empty Id.");
            Assert.True(Prop(item, "Content") as string is { Length: > 0 }, "DTO must include Content.");
            Assert.True(Prop(item, "CreatedAt") is DateTime dt && dt != default, "DTO must include CreatedAt.");
            Assert.True(Prop(item, "StreamId") is Guid sid && sid == streamId, "DTO must include matching StreamId.");
            // UserId is Guid? — assert property exists (null allowed for legacy/anon messages).
            Assert.True(item!.GetType().GetProperty("UserId",
                BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase) != null,
                "DTO must include UserId (nullable).");
            // Nested user { id, username } is ideal for frontend api.ts but optional at RED floor:
            // if present, it must expose a username.
            var user = Prop(item, "User");
            if (user != null)
                Assert.True(Prop(user, "Username") as string is { Length: > 0 }
                    || Prop(user, "UserName") as string is { Length: > 0 },
                    "Nested User, if included, must expose username.");
        }
    }

    [Fact]
    public async Task GetMessages_ExistingStreamNoMessages_Returns200EmptyList()
    {
        var method = FindCanonicalGetMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);

        var controller = new StreamController(ctx);
        var actionResult = await InvokeGetAsync(method!, controller, streamId);
        var inner = UnwrapActionResult(actionResult);

        Assert.True(inner is OkObjectResult,
            $"RED: expected 200 OK with empty list, got {(inner == null ? "null" : inner.GetType().Name)}.");
        Assert.Empty(UnwrapListValues(actionResult));
    }

    [Fact]
    public async Task GetMessages_UnknownStreamId_Returns404()
    {
        var method = FindCanonicalGetMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        SeedStream(ctx);

        var controller = new StreamController(ctx);
        var actionResult = await InvokeGetAsync(method!, controller, Guid.NewGuid());
        var inner = UnwrapActionResult(actionResult);

        Assert.True(inner is NotFoundObjectResult or NotFoundResult,
            $"RED: expected 404 for unknown streamId, got {(inner == null ? "null" : inner.GetType().Name)}.");
    }

    [Fact]
    public void GetMessages_IsAnonymous_NoAuthorizeRequired()
    {
        var method = FindCanonicalGetMethod();
        Assert.True(method != null, RedMissingRoute);

        var hasAuthorize = method!.GetCustomAttribute<AuthorizeAttribute>() != null;
        Assert.True(!hasAuthorize,
            "RED: canonical GET messages must stay ANON (no [Authorize] on action) to match " +
            "GET /api/streams anon. Green gap: do NOT add [Authorize] to this action.");
    }

    [Fact]
    public void GetMessages_MalformedGuid_Returns400ViaRouteConstraint()
    {
        var method = FindCanonicalGetMethod();
        Assert.True(method != null, RedMissingRoute);

        var template = method!.GetCustomAttribute<HttpGetAttribute>()?.Template ?? string.Empty;
        Assert.Contains(":guid", template, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("messages", template, StringComparison.OrdinalIgnoreCase);
        // Documented: with {streamId:guid} the framework rejects malformed Guids with 400
        // before the action executes — no in-action parsing needed on Green.
    }
}
