FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/server/src.Server.csproj", "src/server/"]
dotnet restore "src/server/src.Server.csproj"
COPY src/server/ ./src/server/
dotnet build "src/server/src.Server.csproj" -c Release -o /app/build

FROM build AS publish
dotnet publish "src/server/src.Server.csproj" -c Release -o /app/publish /p:PublishProfile=DefaultContainer

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "mvp_server.dll"]
