// RED tests for issue #7 — canonical POST /api/streams/{streamId}/messages with { content } DTO.
// Option A approved: canonical POST lives in StreamController; legacy MessagesController untouched.
//
// Test-infra choice (documented): controller unit tests with EF Core InMemory AppDbContext
// + mocked ClaimsPrincipal auth, NOT WebApplicationFactory. Rationale:
// - Program.cs uses top-level statements with no `public partial class Program`, so WAF
//   would require modifying Program.cs (out of scope for RED; no src changes allowed).
// - AppDbContext is wired to Npgsql/Postgres + JWT + DB seeding; integration tests would
//   need Postgres replacement, JWT issuance, and config overrides — heavy for RED.
// - Unit-level contract for 401 is the presence of [Authorize] on the canonical action;
//   full 401-pipeline (no JWT -> 401) is deferred to a Green-stage integration test.
// - Legacy MessagesController (POST api/messages/stream/{streamId} with raw string body)
//   is intentionally NOT covered here.

using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using Xunit;

namespace Server.Tests;

public class PostMessageRedTests
{
    private const string RedMissingRoute =
        "RED: canonical POST /api/streams/{streamId}/messages not found on StreamController. " +
        "Green gap: add [HttpPost(\"{streamId}/messages\")] [Authorize] action taking (Guid streamId, { Content } DTO), " +
        "returning 201 CreatedAtAction + Message DTO (Id/Content/CreatedAt/UserId/StreamId), " +
        "400 on empty/whitespace or >500 chars, 404 on unknown streamId, UserId from JWT claims.";

    private static MethodInfo? FindCanonicalPostMethod()
    {
        return typeof(StreamController).GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m =>
            {
                var post = m.GetCustomAttribute<HttpPostAttribute>();
                if (post == null) return false;
                var template = post.Template ?? string.Empty;
                if (!template.Contains("messages", StringComparison.OrdinalIgnoreCase)) return false;
                var parameters = m.GetParameters();
                return parameters.Length == 2 && parameters[0].ParameterType == typeof(Guid);
            });
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static StreamController CreateController(AppDbContext ctx, Guid? userId)
    {
        var controller = new StreamController(ctx);
        ClaimsPrincipal principal = userId.HasValue
            ? new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString())], "mock"))
            : new ClaimsPrincipal(new ClaimsIdentity());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal }
        };
        return controller;
    }

    private static object CreateDtoInstance(Type dtoType, string? content)
    {
        var dto = Activator.CreateInstance(dtoType)!;
        var contentProp = dtoType.GetProperty("Content",
            BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        Assert.True(contentProp != null && contentProp.CanWrite,
            "RED: canonical POST DTO must expose a writable 'Content' string property.");
        contentProp!.SetValue(dto, content);
        return dto;
    }

    private static async Task<object?> InvokePostAsync(
        MethodInfo method, StreamController controller, Guid streamId, string? content)
    {
        var dtoType = method.GetParameters()[1].ParameterType;
        var dto = CreateDtoInstance(dtoType, content);
        var raw = method.Invoke(controller, new[] { (object)streamId, dto });
        Assert.True(raw is Task, "RED: canonical POST action must be awaitable (Task<ActionResult<T>>).");
        await (Task)raw!;
        return raw.GetType().GetProperty("Result")?.GetValue(raw);
    }

    private static IActionResult? UnwrapActionResult(object? actionResult)
    {
        if (actionResult == null) return null;
        if (actionResult is IActionResult direct) return direct;
        return actionResult.GetType().GetProperty("Result")?.GetValue(actionResult) as IActionResult;
    }

    private static object? UnwrapValue(object? actionResult)
    {
        if (actionResult == null) return null;
        var type = actionResult.GetType();
        if (!type.IsGenericType) return (actionResult as CreatedAtActionResult)?.Value;
        return type.GetProperty("Value")?.GetValue(actionResult)
            ?? (UnwrapActionResult(actionResult) as CreatedAtActionResult)?.Value
            ?? (UnwrapActionResult(actionResult) as CreatedResult)?.Value;
    }

    private static Guid SeedStream(AppDbContext ctx)
    {
        var streamId = Guid.NewGuid();
        ctx.Streams.Add(new mvp_server.Models.Stream
        {
            Id = streamId,
            Name = "general",
            ActivityLevel = 0,
            CreatedAt = DateTime.UtcNow
        });
        ctx.SaveChanges();
        return streamId;
    }

    [Fact]
    public async Task PostMessage_ValidContent_Returns201WithDtoAndLocation()
    {
        var method = FindCanonicalPostMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var userId = Guid.NewGuid();
        var controller = CreateController(ctx, userId);

        var actionResult = await InvokePostAsync(method!, controller, streamId, "hello streams");
        var inner = UnwrapActionResult(actionResult);

        Assert.True(inner is CreatedAtActionResult or CreatedResult,
            $"RED: expected 201 Created/CreatedAtAction, got {(inner == null ? "null" : inner.GetType().Name)}.");
        Assert.Equal(201, (inner as ObjectResult)?.StatusCode);

        var value = UnwrapValue(actionResult);
        Assert.NotNull(value);
        var valueType = value!.GetType();
        object? Prop(string name) => valueType.GetProperty(name,
            BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(value);

        Assert.True(Prop("Id") is Guid id && id != Guid.Empty, "Returned DTO must include non-empty Id.");
        Assert.Equal("hello streams", Prop("Content") as string);
        Assert.True(Prop("StreamId") is Guid sid && sid == streamId, "Returned DTO must include matching StreamId.");
        Assert.True(Prop("UserId") is Guid uid && uid == userId, "Returned DTO must include UserId from auth claims.");
        Assert.True(Prop("CreatedAt") is DateTime dt && dt != default, "Returned DTO must include CreatedAt.");

        if (inner is CreatedAtActionResult createdAt)
        {
            var routeValues = createdAt.RouteValues?.Values.Select(v => v?.ToString()) ?? [];
            Assert.Contains(streamId.ToString(), string.Join("/", routeValues));
        }
    }

    [Fact]
    public async Task PostMessage_EmptyOrWhitespaceContent_Returns400()
    {
        var method = FindCanonicalPostMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var controller = CreateController(ctx, Guid.NewGuid());

        foreach (var bad in new[] { "", "   " })
        {
            var actionResult = await InvokePostAsync(method!, controller, streamId, bad);
            var inner = UnwrapActionResult(actionResult);
            Assert.True(inner is BadRequestObjectResult or BadRequestResult,
                $"RED: expected 400 for content '{bad}', got {(inner == null ? "null" : inner.GetType().Name)}.");
        }
    }

    [Fact]
    public async Task PostMessage_ContentOver500Chars_Returns400()
    {
        var method = FindCanonicalPostMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var controller = CreateController(ctx, Guid.NewGuid());

        var tooLong = new string('x', 501);
        var actionResult = await InvokePostAsync(method!, controller, streamId, tooLong);
        var inner = UnwrapActionResult(actionResult);
        Assert.True(inner is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for 501-char content, got {(inner == null ? "null" : inner.GetType().Name)}.");
    }

    [Fact]
    public void PostMessage_AnonymousWithoutJwt_IsProtectedByAuthorize()
    {
        var method = FindCanonicalPostMethod();
        Assert.True(method != null, RedMissingRoute);

        var hasAuthorize = method!.GetCustomAttribute<AuthorizeAttribute>() != null
            || typeof(StreamController).GetCustomAttribute<AuthorizeAttribute>() != null;
        Assert.True(hasAuthorize,
            "RED: canonical POST must require auth ([Authorize] on action or controller) so anonymous callers get 401. " +
            "Green gap: add [Authorize] to the canonical POST action.");
    }

    [Fact]
    public async Task PostMessage_UnknownStreamId_Returns404()
    {
        var method = FindCanonicalPostMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var controller = CreateController(ctx, Guid.NewGuid());

        var actionResult = await InvokePostAsync(method!, controller, Guid.NewGuid(), "hello");
        var inner = UnwrapActionResult(actionResult);
        Assert.True(inner is NotFoundObjectResult or NotFoundResult,
            $"RED: expected 404 for unknown streamId, got {(inner == null ? "null" : inner.GetType().Name)}.");
    }
}
