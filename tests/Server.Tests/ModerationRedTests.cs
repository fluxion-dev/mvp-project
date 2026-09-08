// RED tests for issues #11 + #12 — AdminController.MuteUser / BanUser hardening.
// Auth decision (documented): keep mute/ban ANON for MVP (no [Authorize(Roles=Admin)]).
// Rationale: JWT has no role claim, so Roles=Admin would 403 everyone, breaking.
// Full admin authZ (role claims + policy) is deferred post-MVP.
// Test-infra choice (mirrors AdminDeleteRedTests): controller unit tests with EF Core
// InMemory AppDbContext + TestUserManager stub (override FindByIdAsync), NOT
// WebApplicationFactory and NO Moq. Rationale: Program.cs top-level statements +
// Npgsql wiring make WAF heavy; Moq not referenced (YAGNI — avoid new dependency).
// YAGNI: no persistence — mute/ban remain Ok(message) stubs, no migration.

using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using mvp_server.Data;
using mvp_server.Models;
using Xunit;

namespace Server.Tests;

public class ModerationRedTests
{
    private sealed class TestUserStore : IUserStore<ApplicationUser>
    {
        public Task<IdentityResult> CreateAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<IdentityResult> DeleteAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
        public void Dispose() { }
        public Task<ApplicationUser?> FindByIdAsync(string userId, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<ApplicationUser?> FindByNameAsync(string normalizedUserName, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<string?> GetNormalizedUserNameAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<string> GetUserIdAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<string?> GetUserNameAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task SetNormalizedUserNameAsync(ApplicationUser user, string? normalizedName, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task SetUserNameAsync(ApplicationUser user, string? userName, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<IdentityResult> UpdateAsync(ApplicationUser user, CancellationToken cancellationToken) => throw new NotImplementedException();
    }

    private sealed class TestUserManager : UserManager<ApplicationUser>
    {
        private readonly Dictionary<string, ApplicationUser> _users;

        public TestUserManager(Dictionary<string, ApplicationUser>? users = null)
            : base(
                new TestUserStore(),
                Microsoft.Extensions.Options.Options.Create(new IdentityOptions()),
                new PasswordHasher<ApplicationUser>(),
                Array.Empty<IUserValidator<ApplicationUser>>(),
                Array.Empty<IPasswordValidator<ApplicationUser>>(),
                new UpperInvariantLookupNormalizer(),
                new IdentityErrorDescriber(),
                null!,
                NullLogger<UserManager<ApplicationUser>>.Instance)
        {
            _users = users ?? new Dictionary<string, ApplicationUser>();
        }

        public override Task<ApplicationUser?> FindByIdAsync(string userId) =>
            Task.FromResult(_users.TryGetValue(userId, out var user) ? user : null);
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static AdminController CreateController(AppDbContext ctx, TestUserManager userManager) =>
        new AdminController(ctx, userManager);

    private static string SeedKnownUser(out ApplicationUser user)
    {
        var userId = Guid.NewGuid().ToString();
        user = new ApplicationUser { Id = Guid.Parse(userId), UserName = "testuser" };
        return userId;
    }

    [Fact]
    public async Task Mute_UnknownUser_Returns404()
    {
        using var ctx = CreateDbContext();
        var controller = CreateController(ctx, new TestUserManager());

        var result = await controller.MuteUser(new AdminController.MuteRequest
        {
            UserId = Guid.NewGuid().ToString(),
            DurationMinutes = 60
        });

        Assert.True(result is NotFoundResult or NotFoundObjectResult,
            $"RED: expected 404 for unknown mute userId, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task Mute_EmptyUserId_Returns400()
    {
        using var ctx = CreateDbContext();
        var controller = CreateController(ctx, new TestUserManager());

        var result = await controller.MuteUser(new AdminController.MuteRequest
        {
            UserId = string.Empty,
            DurationMinutes = 60
        });

        Assert.True(result is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for empty mute userId, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task Mute_NonPositiveDuration_Returns400()
    {
        using var ctx = CreateDbContext();
        var userId = SeedKnownUser(out var user);
        var controller = CreateController(ctx, new TestUserManager(new Dictionary<string, ApplicationUser>
        {
            [userId] = user
        }));

        var result = await controller.MuteUser(new AdminController.MuteRequest
        {
            UserId = userId,
            DurationMinutes = -5
        });

        Assert.True(result is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for negative mute duration, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task Ban_UnknownUser_Returns404()
    {
        using var ctx = CreateDbContext();
        var controller = CreateController(ctx, new TestUserManager());

        var result = await controller.BanUser(new AdminController.BanRequest
        {
            UserId = Guid.NewGuid().ToString(),
            DurationDays = 7
        });

        Assert.True(result is NotFoundResult or NotFoundObjectResult,
            $"RED: expected 404 for unknown ban userId, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task Ban_EmptyUserId_Returns400()
    {
        using var ctx = CreateDbContext();
        var controller = CreateController(ctx, new TestUserManager());

        var result = await controller.BanUser(new AdminController.BanRequest
        {
            UserId = string.Empty,
            DurationDays = 7
        });

        Assert.True(result is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for empty ban userId, got {(result == null ? "null" : result.GetType().Name)}.");
    }

    [Fact]
    public async Task Ban_NonPositiveDuration_Returns400()
    {
        using var ctx = CreateDbContext();
        var userId = SeedKnownUser(out var user);
        var controller = CreateController(ctx, new TestUserManager(new Dictionary<string, ApplicationUser>
        {
            [userId] = user
        }));

        var result = await controller.BanUser(new AdminController.BanRequest
        {
            UserId = userId,
            DurationDays = -1
        });

        Assert.True(result is BadRequestObjectResult or BadRequestResult,
            $"RED: expected 400 for negative ban duration, got {(result == null ? "null" : result.GetType().Name)}.");
    }
}
