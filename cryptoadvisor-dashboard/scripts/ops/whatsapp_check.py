"""Check the WhatsApp setup from inside the app container.

    docker exec assetadvisor-app python scripts/ops/whatsapp_check.py [+353861234567]

1. every required WHATSAPP_* variable is set;
2. Meta accepts the token and the phone number id (reads the number's name and quality rating);
3. the webhook answers Meta's verification and accepts a correctly signed call, and refuses a badly signed one;
4. with a phone number argument: sends a test message to that number (it must have messaged the business
   number in the last 24 hours, or be a verified test recipient while using Meta's test number).
"""

import hashlib
import hmac
import json
import os
import sys

import httpx

REQUIRED = ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_DISPLAY_NUMBER", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN")
LOCAL = os.environ.get("AA_LOCAL_URL", "http://127.0.0.1:8050")
ok = True


def check(name, passed, detail=""):
    global ok
    ok &= bool(passed)
    print(f"[{'ok' if passed else 'FAIL'}] {name}{': ' + detail if detail else ''}")


missing = [k for k in REQUIRED if not os.environ.get(k)]
check("environment variables", not missing, f"missing {', '.join(missing)}" if missing else "all set")
if missing:
    sys.exit(1)

version = os.environ.get("WHATSAPP_API_VERSION", "v21.0")
r = httpx.get(f"https://graph.facebook.com/{version}/{os.environ['WHATSAPP_PHONE_NUMBER_ID']}",
              params={"fields": "display_phone_number,verified_name,quality_rating"},
              headers={"Authorization": f"Bearer {os.environ['WHATSAPP_TOKEN']}"}, timeout=15)
body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
check("Meta token and phone number id", r.status_code == 200,
      f"{body.get('verified_name')} {body.get('display_phone_number')} quality {body.get('quality_rating')}"
      if r.status_code == 200 else (body.get("error") or {}).get("message", r.text[:200]))

v = httpx.get(f"{LOCAL}/api/whatsapp/webhook", params={"hub.mode": "subscribe", "hub.verify_token": os.environ["WHATSAPP_VERIFY_TOKEN"],
                                                      "hub.challenge": "1234"}, timeout=10)
check("webhook verification", v.status_code == 200 and v.text == "1234")
payload = json.dumps({"entry": []}).encode()
sig = "sha256=" + hmac.new(os.environ["WHATSAPP_APP_SECRET"].encode(), payload, hashlib.sha256).hexdigest()
good = httpx.post(f"{LOCAL}/api/whatsapp/webhook", content=payload, headers={"x-hub-signature-256": sig}, timeout=10)
bad = httpx.post(f"{LOCAL}/api/whatsapp/webhook", content=payload, headers={"x-hub-signature-256": "sha256=" + "0" * 64}, timeout=10)
check("webhook signature check", good.status_code == 200 and bad.status_code == 403, f"signed {good.status_code}, unsigned {bad.status_code}")

template = os.environ.get("WHATSAPP_ALERT_TEMPLATE")
print(f"[info] alert template: {template or 'not set (alerts only reach users who wrote in the last 24 hours)'}")

if len(sys.argv) > 1:
    to = "".join(ch for ch in sys.argv[1] if ch.isdigit())
    s = httpx.post(f"https://graph.facebook.com/{version}/{os.environ['WHATSAPP_PHONE_NUMBER_ID']}/messages",
                   json={"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": "AssetAdvisor setup check: WhatsApp works."}},
                   headers={"Authorization": f"Bearer {os.environ['WHATSAPP_TOKEN']}"}, timeout=15)
    check(f"test message to +{to}", s.status_code == 200, "" if s.status_code == 200 else s.text[:200])

print("All checks passed." if ok else "Some checks failed: see above and the runbook's WhatsApp section.")
sys.exit(0 if ok else 1)
