using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using mvp_server.Data;
using mvp_server.Models;

[ApiController]
[Route("api/messages")]
public class MessagesWebSocketController : ControllerBase
{
    private readonly AppDbContext _context;
    private static readonly ConcurrentDictionary<Guid, HashSet<WebSocket>> StreamSockets = new();

    public MessagesWebSocketController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("ws/{streamId}")]
    public async Task GetMessagesStream(Guid streamId)
    {
        if (!StreamSockets.TryGetValue(streamId, out var sockets))
        {
            sockets = new HashSet<WebSocket>();
            StreamSockets.TryAdd(streamId, sockets);
        }

        var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
        sockets.Add(webSocket);

        try
        {
            var buffer = new byte[4096];

            while (webSocket.State == WebSocketState.Open)
            {
                var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    sockets.Remove(webSocket);
                    break;
                }

                var messageText = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);

                // Broadcast message to all connected clients for this stream
                var broadcastTask = BroadcastMessageAsync(streamId, messageText);
                await Task.WhenAll(broadcastTask);
            }
        }
        catch
        {
            sockets.Remove(webSocket);
        }
    }

    private async Task BroadcastMessageAsync(Guid streamId, string message)
    {
        if (!StreamSockets.TryGetValue(streamId, out var sockets)) return;

        var json = $"{{\"streamId\": \"{streamId}\", \"content\": \"{message}\"}}";

        var tasks = sockets
            .Where(ws => ws.State == WebSocketState.Open)
            .Select(ws => ws.SendAsync(
                System.Text.Encoding.UTF8.GetBytes(json),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None));

        await Task.WhenAll(tasks);
    }
}