using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mvp_server.Data;
using mvp_server.Models;

[ApiController]
[Route("api/[controller]")]
public class StreamController : ControllerBase
{
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
    public async Task<ActionResult<StreamDto>> CreateStream(StreamCreateRequest request)
    {
        var stream = new mvp_server.Models.Stream
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
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
    public string Name { get; set; } = string.Empty;
}

public class StreamEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int ActivityLevel { get; set; }
    public DateTime CreatedAt { get; set; }
}