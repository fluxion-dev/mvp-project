using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using mvp_server.Data;
using mvp_server.Models;

[ApiController]
[Route("api/messages")]
public class MessagesController : ControllerBase
{
    private readonly AppDbContext _context;

    public MessagesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("stream/{streamId}")]
    public async Task<ActionResult<Message>> CreateMessage(Guid streamId, [FromBody] string content)
    {
        var stream = await _context.Streams.FindAsync(streamId);
        if (stream == null) return NotFound($"Stream {streamId} not found");

        var message = new Message
        {
            Id = Guid.NewGuid(),
            Content = content,
            StreamId = streamId,
            CreatedAt = DateTime.UtcNow
            // UserId is nullable, so we can leave it unset for MVP
        };

        _context.Messages.Add(message);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetMessageById), new { id = message.Id }, message);
    }

    [HttpGet("stream/{streamId}")]
    public async Task<ActionResult<IEnumerable<Message>>> GetMessagesByStream(Guid streamId)
    {
        var stream = await _context.Streams.FindAsync(streamId);
        if (stream == null) return NotFound($"Stream {streamId} not found");

        return _context.Messages
            .Where(m => m.StreamId == streamId)
            .OrderByDescending(m => m.CreatedAt)
            .ToList();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Message>> GetMessageById(Guid id)
    {
        var message = await _context.Messages.FindAsync(id);
        if (message == null) return NotFound();

        return message;
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMessage(Guid id)
    {
        var message = await _context.Messages.FindAsync(id);
        if (message == null) return NotFound();

        _context.Messages.Remove(message);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}