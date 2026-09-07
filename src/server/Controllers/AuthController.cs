using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using mvp_server.Models;
using mvp_server.Services;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ITokenService _tokenService;

    public AuthController(AppDbContext context, UserManager<ApplicationUser> userManager, ITokenService tokenService)
    {
        _context = context;
        _userManager = userManager;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { message = "email is required" });

        if (string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "password is required" });

        if (string.IsNullOrWhiteSpace(request.DisplayName))
            return BadRequest(new { message = "display name is required" });

        var user = new ApplicationUser { UserName = request.Email, Email = request.Email, DisplayName = request.DisplayName };
        var result = await _userManager.CreateAsync(user, request.Password);

        if (result.Succeeded)
        {
            await _userManager.AddToRoleAsync(user, "User");
            var token = _tokenService.GenerateToken(user);
            return Ok(new { token, user = new { user.Id, user.Email, user.DisplayName } });
        }

        // Flatten ASP.NET Identity Errors into a single user-friendly message.
        // Common cases: duplicate email, weak password, invalid email.
        var message = result.Errors.FirstOrDefault()?.Description ?? "Registration failed";
        return BadRequest(new { message });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user != null && await _userManager.CheckPasswordAsync(user, request.Password))
        {
            var token = _tokenService.GenerateToken(user);
            return Ok(new { token, user = new { user.Id, user.Email, user.DisplayName } });
        }

        return Unauthorized(new { message = "invalid email or password" });
    }

    /// <summary>
    /// Logs out the current user.
    /// NOTE: JWTs are stateless and cannot be server-invalidated without a
    /// denylist. Primary logout is client-side (discard the token). The
    /// SignOutAsync calls below are best-effort for completeness (e.g. cookie
    /// scheme if ever enabled) and are no-ops for pure JWT clients.
    /// Future enhancement (out of scope): short-lived access tokens +
    /// refresh-token rotation with server-side revocation, or a JWT denylist.
    /// Both require persistent storage.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        // Best-effort only — JwtBearer handler holds no server-side session state.
        try { await HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme); } catch { /* ignore: scheme may not be registered */ }
        try { await HttpContext.SignOutAsync(JwtBearerDefaults.AuthenticationScheme); } catch { /* ignore: JWT sign-out is stateless */ }
        return Ok(new { message = "logged out successfully" });
    }

    public class RegisterRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}
