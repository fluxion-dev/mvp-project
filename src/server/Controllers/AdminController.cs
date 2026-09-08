using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using mvp_server.Models;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminController(AppDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    [HttpDelete("stream/{streamId}")]
    public async Task<IActionResult> DeleteStream(Guid streamId)
    {
        var stream = await _context.Streams.FindAsync(streamId);
        if (stream == null) return NotFound();

        var messages = await _context.Messages.Where(m => m.StreamId == streamId).ToListAsync();
        _context.Messages.RemoveRange(messages);
        _context.Streams.Remove(stream);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Stream deleted successfully" });
    }

    [HttpDelete("message/{messageId}")]
    public async Task<IActionResult> DeleteMessage(Guid messageId)
    {
        var message = await _context.Messages.FindAsync(messageId);
        if (message == null) return NotFound();

        _context.Messages.Remove(message);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Message deleted successfully" });
    }

    [HttpPost("mute-user")]
    public async Task<IActionResult> MuteUser([FromBody] MuteRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.UserId) || !Guid.TryParse(request.UserId, out _))
            return BadRequest(new { message = "Valid UserId is required" });
        if (request.DurationMinutes <= 0)
            return BadRequest(new { message = "DurationMinutes must be greater than 0" });

        var user = await _userManager.FindByIdAsync(request.UserId);
        if (user == null) return NotFound();

        // In production, would add a Mute entity with expiry
        return Ok(new { message = $"User {user.UserName} has been muted" });
    }

    [HttpPost("ban-user")]
    public async Task<IActionResult> BanUser([FromBody] BanRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.UserId) || !Guid.TryParse(request.UserId, out _))
            return BadRequest(new { message = "Valid UserId is required" });
        if (request.DurationDays <= 0)
            return BadRequest(new { message = "DurationDays must be greater than 0" });

        var user = await _userManager.FindByIdAsync(request.UserId);
        if (user == null) return NotFound();

        // In production, would add a Ban entity with expiry
        return Ok(new { message = $"User {user.UserName} has been banned" });
    }

    public class MuteRequest
    {
        public string UserId { get; set; } = string.Empty;
        public int DurationMinutes { get; set; } = 60;
    }

    public class BanRequest
    {
        public string UserId { get; set; } = string.Empty;
        public int DurationDays { get; set; } = 7;
    }
}