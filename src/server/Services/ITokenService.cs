using mvp_server.Models;

namespace mvp_server.Services;

public interface ITokenService
{
    string GenerateToken(ApplicationUser user);
}
