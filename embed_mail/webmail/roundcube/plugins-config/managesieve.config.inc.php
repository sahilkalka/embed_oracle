<?php
/* Embedded India Mail — filters, vacation reply and forwarding (Settings > Filters). */
$config['managesieve_host'] = 'tls://dovecot:4190';
$config['managesieve_auth_type'] = 'PLAIN';
$config['managesieve_conn_options'] = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]];
$config['managesieve_default'] = '';
$config['managesieve_script_name'] = 'managesieve';
$config['managesieve_vacation'] = 1;
$config['managesieve_forward'] = 1;
$config['managesieve_raw_editor'] = false;
$config['managesieve_kolab_master'] = false;
$config['managesieve_replace_delimiter'] = '';
