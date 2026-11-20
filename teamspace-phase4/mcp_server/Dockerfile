# Remote (HTTP) TeamSpace MCP server, for ChatGPT and other remote MCP clients.
# Build:  docker build -t teamspace-mcp mcp_server
# Run:    see README.md ("Deploy for ChatGPT")
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py oauth_provider.py ./

# Run as an unprivileged user; /data holds the small SQLite file of registered
# OAuth clients (mount a volume there so it survives redeploys).
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
USER app

ENV MCP_TRANSPORT=http \
    MCP_PORT=8080 \
    MCP_DB_PATH=/data/mcp_oauth.db \
    FORWARDED_ALLOW_IPS=*
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('MCP_PORT','8080'),timeout=3)"

CMD ["python", "server.py"]
