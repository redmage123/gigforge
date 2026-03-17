"""PWA manifest and service worker endpoints."""

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse, Response

router = APIRouter()


@router.get("/manifest.json")
async def pwa_manifest():
    manifest = {
        "name": "CryptoAdvisor",
        "short_name": "CryptoAdvisor",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0a0e1a",
        "theme_color": "#0a0e1a",
        "icons": [
            {
                "src": "/static/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
            },
            {
                "src": "/static/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
            },
        ],
    }
    return JSONResponse(content=manifest, media_type="application/manifest+json")


@router.get("/sw.js")
async def service_worker():
    sw_code = """\
const CACHE_NAME = 'cryptoadvisor-v1';
const PRECACHE_URLS = ['/', '/static/style.css'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
"""
    return Response(content=sw_code, media_type="application/javascript")
