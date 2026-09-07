.PHONY: all up down logs migrate seed run-client run-server

all: up

up:
	@docker-compose up -d
	@echo "Services started. Visit http://localhost to view the app."

down:
	@docker-compose down

logs:
	@docker-compose logs -f

migrate:
	@dotnet ef database update --project src/server/Data --startup-project src/server

seed:
	@dotnet run --project src/server -- /seed

run-client:
	@docker exec mvp-client npm run dev

run-server:
	@docker exec mvp-api dotnet run --project src/server
