# Self-Hosted Deployment Guide

## Prerequisites

- Docker and Docker Compose installed on your machine
- Git (to clone the repository)

## Quick Start

```bash
git clone <your-repo-url> beauty-mermaid
cd beauty-mermaid
docker compose up -d
```

The editor is now available at **http://localhost:3000**.

## Configuration

### Custom Port

Set the `PORT` environment variable:

```bash
PORT=8080 docker compose up -d
```

Or create a `.env` file:

```
PORT=8080
```

Then run:

```bash
docker compose up -d
```

## Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build

# View logs
docker compose logs -f
```

## Reverse Proxy (Optional)

If you want to serve behind a reverse proxy with HTTPS, add this to your existing nginx/Caddy config:

### Caddy

```
mermaid.example.com {
    reverse_proxy localhost:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name mermaid.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```
