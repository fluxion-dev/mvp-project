// RED tests for issue #14 — PUT /api/streams/{id} update (Name validation).
// No OwnerId on Stream model, so auth decision (documented): use plain [Authorize]
// (NOT Roles=Admin — JWT has no roles, Roles=Admin would 403 everyone, breaking).
//
// DELETE mismatch (documented, NOT changed here): frontend api.ts deleteStream() calls
// DELETE api/streams/{id}, but backend delete lives in AdminController at
// DELETE api/admin/stream/{streamId}. Do NOT change route in this issue; frontend/delete
// alignment is deferred to a separate issue.
//
// Test-infra choice (documented, mirrors #7 PostMessageRedTests): controller unit tests
// with EF Core InMemory AppDbContext + reflection lookup, NOT WebApplicationFactory.
// Rationale: Program.cs top-level statements (no `public partial class Program`), so WAF
// would require modifying Program.cs (out of scope for RED; no src changes allowed).
// Reflection lookup lets this file compile pre-Green; every test fails with RedMissingRoute
// until Green adds the action. Unit-level contract for 401 is presence of [Authorize];
// full 401-pipeline (no JWT -> 401) is deferred like #7.

using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using Xunit;

namespace Server.Tests;

public class PutStreamRedTests
{
    private const string RedMissingRoute =
        "RED: PUT /api/streams/{id} not found on StreamController. " +
        "Green gap: add [Authorize][HttpPut(\"{id:guid}\")] action taking (Guid id, { Name } DTO), " +
        "Find → 404, trim validate 1-100 → 400, save, return Ok(StreamDto).";

    private static MethodInfo? FindCanonicalPutMethod()
    {
        return typeof(StreamController).GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m =>
            {
                var put = m.GetCustomAttribute<HttpPutAttribute>();
                if (put == null) return false;
                var parameters = m.GetParameters();
                if (parameters.Length != 2) return false;
                if (parameters[0].ParameterType != typeof(Guid)) return false;
                var dtoType = parameters[1].ParameterType;
                var nameProp = dtoType.GetProperty("Name",
                    BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
                return nameProp != null && nameProp.PropertyType == typeof(string) && nameProp.CanWrite;
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

    private static object CreateDtoInstance(Type dtoType, string? name)
    {
        var dto = Activator.CreateInstance(dtoType)!;
        var nameProp = dtoType.GetProperty("Name",
            BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        Assert.True(nameProp != null && nameProp.CanWrite,
            "RED: PUT DTO must expose a writable 'Name' string property.");
        nameProp!.SetValue(dto, name);
        return dto;
    }

    private static async Task<object?> InvokePutAsync(
        MethodInfo method, StreamController controller, Guid id, string? name)
    {
        var dtoType = method.GetParameters()[1].ParameterType;
        var dto = CreateDtoInstance(dtoType, name);
        var raw = method.Invoke(controller, new[] { (object)id, dto });
        Assert.True(raw is Task, "RED: PUT action must be awaitable (Task<ActionResult<T>>).");
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
        if (type.IsGenericType)
        {
            var value = type.GetProperty("Value")?.GetValue(actionResult);
            if (value != null) return value;
        }
        return (UnwrapActionResult(actionResult) as OkObjectResult)?.Value
            ?? (UnwrapActionResult(actionResult) as ObjectResult)?.Value;
    }

    private static object? Prop(object? target, string name) =>
        target?.GetType().GetProperty(name,
            BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(target);

    [Fact]
    public async Task PutStream_ValidRename_Returns200WithUpdatedDto()
    {
        var method = FindCanonicalPutMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx, "general");
        var controller = new StreamController(ctx);

        var actionResult = await InvokePutAsync(method!, controller, streamId, "renamed");
        var inner = UnwrapActionResult(actionResult);

        Assert.True(inner is OkObjectResult,
            $"RED: expected 200 OK (OkObjectResult), got {(inner == null ? "null" : inner.GetType().Name)}.");

        var value = UnwrapValue(actionResult);
        Assert.NotNull(value);
        Assert.Equal(streamId, (Guid)Prop(value, "Id")!);
        Assert.Equal("renamed", Prop(value, "Name") as string);

        var reloaded = await ctx.Streams.FindAsync(streamId);
        Assert.NotNull(reloaded);
        Assert.Equal("renamed", reloaded!.Name);
    }

    [Fact]
    public async Task PutStream_EmptyOrWhitespaceName_Returns400()
    {
        var method = FindCanonicalPutMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var controller = new StreamController(ctx);

        foreach (var bad in new[] { "", "   " })
        {
            var actionResult = await InvokePutAsync(method!, controller, streamId, bad);
            var inner = UnwrapActionResult(actionResult);
            Assert.True(inner is BadRequestObjectResult or BadRequestResult,
                $"RED: expected 400 for name '{bad}', got {(inner == null ? "null" : inner.GetType().Name)}.");
        }
    }

    [Fact]
    public async Task PutStream_NameOver100Chars_Returns400()
    {
        var method = FindCanonicalPutMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        var streamId = SeedStream(ctx);
        var controller = new StreamController(ctx);

        var tooLong = new string('x', 101);
        var actionResult = await InvokePutAsync(method!, controller, streamId, tooLong);
        var inner = UnwrapActionResult(actionResult);
        Assert.True(inner is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for 101-char name, got {(inner == null ? "null" : inner.GetType().Name)}.");
    }

    [Fact]
    public async Task PutStream_UnknownId_Returns404()
    {
        var method = FindCanonicalPutMethod();
        Assert.True(method != null, RedMissingRoute);

        using var ctx = CreateDbContext();
        SeedStream(ctx);
        var controller = new StreamController(ctx);

        var actionResult = await InvokePutAsync(method!, controller, Guid.NewGuid(), "renamed");
        var inner = UnwrapActionResult(actionResult);
        Assert.True(inner is NotFoundObjectResult or NotFoundResult,
            $"RED: expected 404 for unknown id, got {(inner == null ? "null" : inner.GetType().Name)}.");
    }

    [Fact]
    public void PutStream_AnonymousWithoutJwt_IsProtectedByAuthorize()
    {
        var method = FindCanonicalPutMethod();
        Assert.True(method != null, RedMissingRoute);

        var authorize = method!.GetCustomAttribute<AuthorizeAttribute>()
            ?? typeof(StreamController).GetCustomAttribute<AuthorizeAttribute>();
        Assert.True(authorize != null,
            "RED: PUT must require auth ([Authorize] on action or controller) so anonymous callers get 401. " +
            "Green gap: add [Authorize] (NOT Roles=Admin — JWT has no roles) to the PUT action. " +
            "Full JWT 401-pipeline deferred like #7.");
        var roles = authorize!.Roles ?? string.Empty;
        Assert.False(roles.Contains("Admin", StringComparison.OrdinalIgnoreCase),
            "RED: PUT must NOT require Roles=Admin (JWT has no role claim; would 403 everyone). Use plain [Authorize].");
    }
}
