FROM python:3.12-slim

WORKDIR /app

# Install Node.js for frontend build
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-warm MetPy: build the matplotlib font cache and download the station
# tables now so the first METAR parse at runtime is fast and offline-safe.
RUN python -c "from metpy.io.metar import parse_metar; parse_metar('MYNN 011200Z 09012KT 9999 BKN045 30/24 Q1016', 2026, 1)" || true

# Copy backend first
COPY . .

# Frontend build AFTER backend copy — so it overwrites any stale static/react/
COPY frontend/package*.json frontend/
RUN cd frontend && npm install
RUN cd frontend && npm run build && \
    mkdir -p /app/static/react && \
    rm -rf /app/static/react/* && \
    cp -r dist/* /app/static/react/

EXPOSE 8060

CMD ["python", "main.py"]
