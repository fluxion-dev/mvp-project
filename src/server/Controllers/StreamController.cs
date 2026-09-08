using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using mvp_server.Models;

[ApiController]
[Route("api/streams")]
public class StreamController : ControllerBase
{
    private const int MaxContentLength = 500;
    private readonly AppDbContext _context;

    public StreamController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<StreamDto>>> GetStreams()
    {
        return await _context.Streams.Select(s => new StreamDto
        {
            Id = s.Id,
            Name = s.Name,
            ActivityLevel = s.ActivityLevel,
            CreatedAt = s.CreatedAt
        }).ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<StreamDto>> GetStream(Guid id)
    {
        var stream = await _context.Streams.FindAsync(id);
        if (stream == null) return NotFound();
        return new StreamDto
        {
            Id = stream.Id,
            Name = stream.Name,
            ActivityLevel = stream.ActivityLevel,
            CreatedAt = stream.CreatedAt
        };
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<StreamDto>> CreateStream(StreamCreateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "name is required" });

        var stream = new mvp_server.Models.Stream
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            ActivityLevel = 0,
            CreatedAt = DateTime.UtcNow
        };

        _context.Streams.Add(stream);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetStream), new { id = stream.Id },
            new StreamDto
            {
                Id = stream.Id,
                Name = stream.Name,
                ActivityLevel = stream.ActivityLevel,
                CreatedAt = stream.CreatedAt
            });
    }

    [HttpGet("{streamId:guid}/messages")]
    public async Task<ActionResult<IEnumerable<MessageDto>>> GetMessages(Guid streamId)
    {
        var stream = await _context.Streams.FindAsync(streamId);
        if (stream == null) return NotFound();

        var messages = await _context.Messages
            .Where(m => m.StreamId == streamId)
            .OrderByDescending(m => m.CreatedAt)
            .AsNoTracking()
            .ToListAsync();

        var userIds = messages
            .Where(m => m.UserId.HasValue)
            .Select(m => m.UserId!.Value)
            .Distinct()
            .ToList();

        var users = userIds.Count == 0
            ? new Dictionary<Guid, mvp_server.Models.ApplicationUser>()
            : await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .AsNoTracking()
                .ToDictionaryAsync(u => u.Id);

        var result = messages.Select(m => new MessageDto
        {
            Id = m.Id,
            Content = m.Content,
            CreatedAt = m.CreatedAt,
            UserId = m.UserId,
            StreamId = m.StreamId,
            User = m.UserId.HasValue && users.TryGetValue(m.UserId.Value, out var user)
                ? new MessageUserDto
                {
                    Id = user.Id,
                    Username = user.DisplayName ?? user.UserName ?? string.Empty
                }
                : null
        }).ToList();

        return Ok(result);
    }

    [HttpPost("{streamId:guid}/messages")]
    [Authorize]
    public async Task<ActionResult<MessageDto>> PostMessage(Guid streamId, CreateMessageRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { message = "content is required" });

        var trimmed = request.Content.Trim();
        if (trimmed.Length > MaxContentLength)
            return BadRequest(new { message = $"content must be {MaxContentLength} characters or fewer" });

        var stream = await _context.Streams.FindAsync(streamId);
        if (stream == null) return NotFound();

        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        Guid? userId = null;
        if (claim != null && Guid.TryParse(claim, out var parsed))
            userId = parsed;

        var message = new Message
        {
            Id = Guid.NewGuid(),
            Content = trimmed,
            CreatedAt = DateTime.UtcNow,
            StreamId = streamId,
            UserId = userId
        };

        _context.Messages.Add(message);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetStream), new { id = streamId, messageId = message.Id },
            new MessageDto
            {
                Id = message.Id,
                Content = message.Content,
                CreatedAt = message.CreatedAt,
                UserId = message.UserId,
                StreamId = message.StreamId
            });
    }
}

public class StreamDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ActivityLevel { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class StreamCreateRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}

public class CreateMessageRequest
{
    public string Content { get; set; } = string.Empty;
}

public class MessageDto
{
    public Guid Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public Guid? UserId { get; set; }
    public Guid StreamId { get; set; }
    public MessageUserDto? User { get; set; }
}

public class MessageUserDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
}