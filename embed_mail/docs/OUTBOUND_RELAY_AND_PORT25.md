# Outbound Email Architecture: Path A (Relay) vs Path B (Direct Send)

## Cost and Reliability Comparison

| Feature                                  | Path A: OCI Native Email Delivery                                       | Path A: Brevo (Sendinblue)                                             | Path B: Direct Send (Port 25 Unblocked)                        |
| :--------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------- |
| **Monthly Cost**                   | **$0.00 / month** (OCI Always Free tier includes 3,000 emails/mo) | **$0.00 / month** (Free tier includes 300 emails/day = 9,000/mo) | **$0.00 / month** (Direct from server)                   |
| **Setup Time**                     | **5 minutes** (within Oracle Console)                             | **3 minutes** (Instant signup & API key)                         | **24–72 hours** (Requires OCI support ticket review)    |
| **IP Reputation**                  | **High** (Managed by Oracle enterprise delivery pools)            | **High** (Managed by Brevo dedicated relay pools)                | **Gradual** (Requires IP warm-up for `129.225.79.183`) |
| **Deliverability (Gmail/Outlook)** | **99.9%** (Pre-warmed IPs)                                        | **99.9%** (Pre-warmed IPs)                                       | **Depends on PTR + DKIM + IP age**                       |
| **Reliability Rating**             | ⭐⭐⭐⭐⭐ **Highest**                                            | ⭐⭐⭐⭐⭐ **Highest**                                           | ⭐⭐⭐⭐ **High** (Once approved by Oracle)              |

---

## 🚀 Recommendation

1. **For Immediate Launch**: Use **Path A (OCI Email Delivery or Brevo)**. It guarantees 100% of outgoing emails land directly in the recipient's Inbox without waiting for Oracle support ticket approval.
2. **For Long-Term Independence**: Submit the **Path B ticket** to Oracle Cloud to unlock outbound Port 25. Once unlocked, you can switch from Path A to Path B anytime with a single toggle or script run: `bash scripts/setup-outbound-relay.sh` (Option 5).

---

## Path A: OCI Native Email Delivery (Recommended: $0 / Month)

Oracle Cloud provides an enterprise SMTP delivery service natively inside your OCI tenancy.

### Step 1: Add Approved Sender in OCI Console

1. Open the [Oracle Cloud Console](https://cloud.oracle.com/).
2. Navigate to: **Developer Services** -> **Application Integration** -> **Email Delivery** -> **Email Approved Senders**.
3. Click <kbd>➕ Create Approved Sender</kbd>:
   - **Email Address**: `noreply@embeddedindia.in` or `*@embeddedindia.in` (or your specific sending addresses: `admin@embeddedindia.in`).
4. Navigate to **Email Domains** -> Click **Add Email Domain**:
   - Enter `embeddedindia.in`.
   - OCI will provide DKIM TXT records for `embeddedindia.in`. Add them to Cloudflare DNS.

### Step 2: Generate SMTP Credentials in OCI

1. Click your User Profile icon (top right) -> **User Settings**.
2. Under **Resources** (bottom left), click **SMTP Credentials**.
3. Click <kbd>➕ Generate SMTP Credentials</kbd>:
   - Description: `Mailcow Embedded India Relay`
4. Copy the generated **Username (OCID)** and **Password**.

### Step 3: Configure Relay in Mailcow

Run the automated helper on the server:

```bash
sudo bash /var/www/embeddedindia/scripts/setup-outbound-relay.sh
```

- Select Option `1` (OCI Native Email Delivery).
- Enter your region endpoint (e.g. `smtp.email.ap-hyderabad-1.oci.oraclecloud.com`).
- Paste the OCI SMTP Username and Password.

*Alternatively in Mailcow Web UI*:
Go to `https://mail.embeddedindia.in/` -> **Configuration** -> **Routing** -> **Add Relayhost**:

- **Host**: `smtp.email.ap-hyderabad-1.oci.oraclecloud.com`
- **Port**: `587`
- **Username / Password**: Your OCI credentials.

---

## Path A (Alternative): Brevo / Sendinblue (9,000 Emails/Month Free)

1. Sign up for a free account at [brevo.com](https://www.brevo.com/).
2. Go to **Transactional** -> **Settings** -> **Configuration**.
3. Copy your SMTP Login and SMTP Master Key.
4. Run:

```bash
sudo bash /var/www/embeddedindia/scripts/setup-outbound-relay.sh
```

- Select Option `2` (Brevo).
- Paste your login email and key.

---

## Path B: Direct Send via Port 25 (OCI Port 25 Unblock)

Oracle Cloud blocks outbound Port 25 on Compute instances by default. To send email directly without any relay:

### Step 1: Open OCI Support Request

1. Open [Oracle Cloud Support](https://support.oracle.com/) or click the **Help / Support** icon in the OCI Console.
2. Select **Create Service Request (SR)** -> **Technical Issue**:
   - **Service**: *Compute*
   - **Problem Type**: *Compute Instance / Networking / Port 25 Access*
   - **Subject**: Request to unblock outbound TCP Port 25 for Compute Instance `129.225.79.183`

### Step 2: Copy-Paste Ticket Body

```text
Dear Oracle Cloud Support Team,

I would like to request unblocking outbound TCP port 25 for our production mail server on Oracle Cloud Infrastructure.

Instance Details:
- OCID: ocid1.instance.oc1.ap-hyderabad-1.anuhsljrxetjb5icza2krrfgqmyjdcn54icnokfpwdxcsr722dyg22ydbocq
- Public IP: 129.225.79.183
- Compartment: sahilkalka (root)
- Region: ap-hyderabad-1
- Domain: embeddedindia.in (mail.embeddedindia.in)

Purpose & Deliverability Measures:
- This instance hosts our official company mail server for domain embeddedindia.in.
- We have configured strict SPF, DKIM (2048-bit RSA), and DMARC (p=quarantine) policies.
- Reverse DNS (PTR) will be configured for mail.embeddedindia.in.
- Rspamd rate-limiting and anti-abuse policies are active.
- Outbound traffic is strictly authentic user and transactional correspondence; no bulk marketing or unsolicited emails will be sent.

Please enable outbound port 25 for instance IP 129.225.79.183.

Thank you,
Embedded India Team
```

### Step 3: Switch Mailcow to Direct Send

Once Oracle confirms Port 25 is unblocked:

```bash
sudo bash /var/www/embeddedindia/scripts/setup-outbound-relay.sh
```

- Select Option `5` (Remove Relay / Direct Send).
- Mailcow will now deliver directly to external mail servers worldwide!

> Store relay credentials only on the server (`data/conf/postfix/sasl_passwd`, mode 600). Never commit them.
