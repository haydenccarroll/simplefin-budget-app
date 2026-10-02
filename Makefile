.PHONY: up down logs ps reset build

# Start (or update) the whole stack in the background.
up:
	docker compose up -d --build

# Stop it. Data is kept.
down:
	docker compose down

# Follow the API and worker logs.
logs:
	docker compose logs -f api worker

ps:
	docker compose ps

build:
	docker compose build

# Stop everything AND delete the database and model volumes.
reset:
	docker compose down -v
