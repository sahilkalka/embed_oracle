#!/usr/bin/env python3
"""End-to-end webmail check with a temporary mailbox. Creates it, exercises the webmail, deletes it."""
import json, re, secrets, sys, time, urllib.request, urllib.parse, http.cookiejar

API = "http://127.0.0.1:8088/api/v1"
KEY = [l.split("=", 1)[1].strip() for l in open("/embed_mail/mailcow.conf") if l.startswith("API_KEY=")][0]
BASE = "https://mail.embeddedindia.in/"
USER = "webmail-check@embeddedindia.in"
PASS = "Wc-" + secrets.token_urlsafe(18) + "!9"

def api(path, payload=None):
    req = urllib.request.Request(f"{API}/{path}", data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"X-API-Key": KEY, "Content-Type": "application/json"},
                                 method="POST" if payload is not None else "GET")
    return json.loads(urllib.request.urlopen(req, timeout=30).read() or "null")

jar = http.cookiejar.CookieJar()
web = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def get(q=""):
    return web.open(BASE + q, timeout=30).read().decode("utf-8", "replace")
def post(data, q=""):
    return web.open(BASE + q, data=urllib.parse.urlencode(data).encode(), timeout=60).read().decode("utf-8", "replace")
def token(html):
    m = re.search(r'name="_token" value="([^"]+)"', html) or re.search(r'"request_token":"([^"]+)"', html)
    return m.group(1) if m else ""

results = []
def check(name, ok, detail=""):
    results.append(ok); print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}")

def visible(html):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    return re.sub(r"<[^>]+>", " ", text)
def leaks(html):
    return sorted(set(m.group(0) for m in re.finditer(r"(?i)roundcube|sogo", visible(html))))

try:
    r = api("add/mailbox", {"local_part": "webmail-check", "domain": "embeddedindia.in", "name": "Webmail check",
                            "quota": "50", "password": PASS, "password2": PASS, "active": "1", "force_pw_update": "0"})
    check("temporary mailbox created", any(x.get("type") == "success" for x in r), str(r)[:120])
    time.sleep(3)

    html = get()
    check("login page branded", "Embedded India Mail" in html and not leaks(html))
    html = post({"_token": token(html), "_task": "login", "_action": "login", "_timezone": "Asia/Kolkata",
                 "_url": "", "_user": USER, "_pass": PASS}, "?_task=login")
    logged = "rcmail.set_env" in html and '"task":"mail"' in html
    check("login", logged)
    if not logged:
        sys.exit(1)
    tok = token(html)
    check("mail view branded (no product names)", not leaks(html), ", ".join(leaks(html)))
    folders = set(re.findall(r'class="mailbox (inbox|drafts|sent|junk|trash|archive)\b', html))
    if len(folders) < 5:
        i = html.find("mailboxlist")
        print("    snippet:", re.sub(r"\s+", " ", html[i:i + 600]) if i >= 0 else "mailboxlist not in page")
    check("default folders present", len(folders) >= 5, ", ".join(sorted(folders)))

    for name, q in [("settings: preferences", "?_task=settings&_action=preferences"),
                    ("settings: folders", "?_task=settings&_action=folders"),
                    ("settings: identities", "?_task=settings&_action=identities"),
                    ("settings: filters / vacation", "?_task=settings&_action=plugin.managesieve"),
                    ("settings: vacation reply", "?_task=settings&_action=plugin.managesieve-vacation"),
                    ("settings: password", "?_task=settings&_action=plugin.password"),
                    ("settings: two-factor login", "?_task=settings&_action=plugin.twofactor_gauthenticator"),
                    ("contacts", "?_task=addressbook"),
                    ("contacts: server address book listed", "?_task=addressbook"),
                    ("about page branded", "?_task=settings&_action=about")]:
        try:
            page = get(q)
            bad = leaks(page)
            err = re.search(r"(?i)(connection to storage server failed|server error|unable to connect|internal error|no handler)", visible(page))
            if name == "contacts: server address book listed":
                check(name, "Contacts" in visible(page) and "carddav" in page.lower()); continue
            check(name, not bad and not err, (", ".join(bad) if bad else "") + (err.group(0) if err else ""))
        except Exception as e:
            check(name, False, str(e)[:120])

    # Send a message to ourselves through the webmail
    comp = get("?_task=mail&_action=compose")
    cid = re.search(r'"compose_id":"([^"]+)"', comp)
    ctok = token(comp)
    ident = re.search(r'name="_from"[^>]*>\s*<option value="(\d+)"', comp)
    sent = ""
    if cid:
        sent = post({"_token": ctok, "_task": "mail", "_action": "send", "_id": cid.group(1), "_from": ident.group(1) if ident else "",
                     "_to": USER, "_subject": "webmail check " + str(int(time.time())), "_is_html": "0",
                     "_message": "End-to-end check from Embedded India Mail.", "_framed": "1",
                     "_unlock": "1", "_draft": ""},
                    "?_task=mail&_action=send&_remote=1&_unlock=1")
    check("compose window", bool(cid), "identity " + (ident.group(1) if ident else "?"))
    check("send via SMTP", "sent_successfully" in sent or "messagesent" in sent.lower() or "Message sent" in sent, re.sub(r"\s+", " ", sent)[:160])
    time.sleep(6)
    lst = get(f"?_task=mail&_action=list&_mbox=INBOX&_remote=1&_token={tok}")
    check("message received in Inbox", "webmail check" in lst)
finally:
    try:
        r = api("delete/mailbox", [USER])
        print("  cleanup:", "mailbox deleted" if any(x.get("type") == "success" for x in r) else r)
    except Exception as e:
        print("  cleanup FAILED:", e)
print(f"\nRESULT: {sum(results)}/{len(results)} checks passed")
