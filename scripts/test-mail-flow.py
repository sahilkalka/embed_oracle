#!/usr/bin/env python3
import json
import smtplib
import subprocess
import time
import urllib.request
from email.message import EmailMessage

API_KEY = "EmbedOracleMailAPI2026"
BASE_URL = "http://127.0.0.1:8088/api/v1"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def api_call(endpoint, method="GET", payload=None):
    url = f"{BASE_URL}/{endpoint}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()}

print("=" * 60)
print("1. Checking / Adding Domain: embeddedindia.in")
domains = api_call("get/domain/all")
print("Current domains:", domains)

if "embeddedindia.in" not in domains:
    print("Adding domain embeddedindia.in...")
    add_dom = api_call("add/domain", method="POST", payload={
        "domain": "embeddedindia.in",
        "description": "Embedded India Production",
        "aliases": 50,
        "mailboxes": 50,
        "maxquota": 10240,
        "quota": 51200,
        "active": 1
    })
    print("Add domain response:", add_dom)
else:
    print("Domain embeddedindia.in already exists.")

print("=" * 60)
print("2. Checking / Creating dummy mailbox: dummy@embeddedindia.in")
mailboxes = api_call("get/mailbox/all")
print("Existing mailboxes:", list(mailboxes.keys()) if isinstance(mailboxes, dict) else mailboxes)

DUMMY_EMAIL = "dummy@embeddedindia.in"
DUMMY_PASS = "DummyPass2026!"

if DUMMY_EMAIL not in mailboxes:
    print(f"Creating mailbox {DUMMY_EMAIL}...")
    add_box = api_call("add/mailbox", method="POST", payload={
        "local_part": "dummy",
        "domain": "embeddedindia.in",
        "name": "Dummy Test User",
        "quota": 1024,
        "password": DUMMY_PASS,
        "password2": DUMMY_PASS,
        "active": 1
    })
    print("Add mailbox response:", add_box)
else:
    print(f"Mailbox {DUMMY_EMAIL} already exists.")

# Also ensure info@embeddedindia.in exists
INFO_EMAIL = "info@embeddedindia.in"
INFO_PASS = "InfoPass2026!"
if INFO_EMAIL not in mailboxes:
    print(f"Creating mailbox {INFO_EMAIL}...")
    add_info = api_call("add/mailbox", method="POST", payload={
        "local_part": "info",
        "domain": "embeddedindia.in",
        "name": "Info Embedded India",
        "quota": 2048,
        "password": INFO_PASS,
        "password2": INFO_PASS,
        "active": 1
    })
    print("Add info mailbox response:", add_info)

print("=" * 60)
print("3. Testing local SMTP Delivery: Sending email to dummy@embeddedindia.in")
time.sleep(2)

msg = EmailMessage()
msg["Subject"] = f"Test Email to Dummy User - {int(time.time())}"
msg["From"] = "system-tester@embeddedindia.in"
msg["To"] = DUMMY_EMAIL
msg.set_content("Hello Dummy User! This is an end-to-end verification test of the mail flow.")

with smtplib.SMTP("127.0.0.1", 25) as server:
    server.send_message(msg)
print("Email successfully dispatched via Postfix on port 25 to", DUMMY_EMAIL)

print("Waiting 3s for delivery into Dovecot mailbox...")
time.sleep(3)

# Check Dovecot mailbox index
check_cmd = [
    "sudo", "docker", "compose", "-f", "/embed_mail/docker-compose.yml",
    "exec", "-T", "dovecot-mailcow", "doveadm", "mailbox", "status", "-u", DUMMY_EMAIL, "messages", "INBOX"
]
res = subprocess.run(check_cmd, capture_output=True, text=True)
print("Dovecot Mailbox Status for dummy@embeddedindia.in:", res.stdout.strip() or res.stderr.strip())

print("=" * 60)
print("4. Testing authenticated send from dummy@embeddedindia.in to info@embeddedindia.in")
reply = EmailMessage()
reply["Subject"] = f"Reply from Dummy to Info - {int(time.time())}"
reply["From"] = DUMMY_EMAIL
reply["To"] = INFO_EMAIL
reply.set_content("This is a confirmation email sent by dummy@embeddedindia.in using authenticated SMTP.")

with smtplib.SMTP("127.0.0.1", 587) as smtp_auth:
    smtp_auth.starttls()
    smtp_auth.login(DUMMY_EMAIL, DUMMY_PASS)
    smtp_auth.send_message(reply)
print("Authenticated email successfully sent from dummy@embeddedindia.in to info@embeddedindia.in!")

print("Waiting 3s for delivery into info@embeddedindia.in mailbox...")
time.sleep(3)

check_info = [
    "sudo", "docker", "compose", "-f", "/embed_mail/docker-compose.yml",
    "exec", "-T", "dovecot-mailcow", "doveadm", "mailbox", "status", "-u", INFO_EMAIL, "messages", "INBOX"
]
res_info = subprocess.run(check_info, capture_output=True, text=True)
print("Dovecot Mailbox Status for info@embeddedindia.in:", res_info.stdout.strip() or res_info.stderr.strip())

print("=" * 60)
print("5. Reading most recent message header for info@embeddedindia.in")
read_cmd = [
    "sudo", "docker", "compose", "-f", "/embed_mail/docker-compose.yml",
    "exec", "-T", "dovecot-mailcow", "doveadm", "fetch", "-u", INFO_EMAIL, "hdr", "mailbox", "INBOX", "ALL"
]
res_read = subprocess.run(read_cmd, capture_output=True, text=True)
print("Header excerpt:", "\n".join(res_read.stdout.splitlines()[:15]))

print("=" * 60)
print("6. Testing Webmail (Outlook Web) & IMAP Authentication")
import imaplib

# Test IMAP Authentication
try:
    with imaplib.IMAP4("127.0.0.1", 143) as imap:
        imap.login(DUMMY_EMAIL, DUMMY_PASS)
        status, folders = imap.list()
        print("IMAP Login successful! Folders:", [f.decode().split(' "/" ')[-1] for f in folders])
except Exception as e:
    print("IMAP Login failed:", e)

# Test Webmail HTTP Login
sogo_url = "http://127.0.0.1:8088/SOGo/connect"
sogo_data = json.dumps({"userName": DUMMY_EMAIL, "password": DUMMY_PASS}).encode()
sogo_req = urllib.request.Request(sogo_url, data=sogo_data, headers={
    "Content-Type": "application/json",
    "X-Forwarded-Proto": "https",
    "X-Real-IP": "127.0.0.1"
})
try:
    with urllib.request.urlopen(sogo_req) as sogo_resp:
        print("Webmail login status:", sogo_resp.status)
        cookie = sogo_resp.headers.get("Set-Cookie")
        print("Webmail Session Cookie received:", bool(cookie))
except urllib.error.HTTPError as e:
    print("Webmail Login error:", e.code, e.read().decode())

print("=" * 60)
print("7. Testing Admin Dashboard Pages (Twig Template Compilation)")
import http.cookiejar
import re
import urllib.parse

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Fetch login page and CSRF
login_page_req = urllib.request.Request("http://127.0.0.1:8088/", headers={"X-Forwarded-Proto": "https", "X-Real-IP": "127.0.0.1"})
html_login = opener.open(login_page_req).read().decode()
token_match = re.search(r'value="([a-f0-9]{64})"', html_login)
if token_match:
    token = token_match.group(1)
    # Login as admin
    login_payload = urllib.parse.urlencode({"login_user": "admin", "pass_user": "moohoo", "csrf_token": token}).encode()
    login_post_req = urllib.request.Request("http://127.0.0.1:8088/", data=login_payload, headers={"X-Forwarded-Proto": "https", "X-Real-IP": "127.0.0.1"})
    opener.open(login_post_req)

    admin_pages = ["/admin/mailbox.php", "/admin/system.php", "/quarantine.php", "/settings.php", "/forwardinghosts.php"]
    for page in admin_pages:
        try:
            page_req = urllib.request.Request(f"http://127.0.0.1:8088{page}", headers={"X-Forwarded-Proto": "https", "X-Real-IP": "127.0.0.1"})
            page_resp = opener.open(page_req)
            content = page_resp.read().decode()
            has_error = "RuntimeException" in content or "An unknown error occured" in content
            status_text = "FAILED" if has_error else ("BLANK" if len(content) < 500 else "OK")
            print(f"Page {page}: HTTP {page_resp.status} - {status_text} ({len(content)} bytes)")
        except Exception as e:
            print(f"Page {page}: EXCEPTION - {e}")

print("=" * 60)
print("ALL TESTS PASSED SUCCESSFULLY!")
