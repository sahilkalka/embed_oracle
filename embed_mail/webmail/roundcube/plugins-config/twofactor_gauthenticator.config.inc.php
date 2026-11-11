<?php
/* Embedded India Mail — optional two-step login (Settings > 2-Step Verification). */

// Every mailbox may enable it; nobody is forced yet (set true to require it for all).
$rcmail_config['users_allowed_2FA'] = array('.*@embeddedindia\.in');
$rcmail_config['force_enrollment_users'] = false;
$rcmail_config['force_enrollment_users_list'] = array();

// No network bypasses 2FA.
$rcmail_config['whitelist'] = array();

// "Trust this device for 30 days" checkbox on the code prompt.
$rcmail_config['allow_save_device_30days'] = true;
$rcmail_config['twofactor_formfield_as_password'] = true;

// Secrets stored encrypted with the webmail key; failures logged; brute-force back-off.
$rcmail_config['twofactor_pref_encrypt'] = true;
$rcmail_config['enable_fail_logs'] = true;
$rcmail_config['twofactor_lockout_delays'] = array(1, 2, 5, 20, 60, 300, 600);
$rcmail_config['twofactor_lockout'] = 900;

// REMOTE_ADDR is already the real client IP (set by the mail server's nginx).
$rcmail_config['twofactor_trusted_proxies'] = array();
