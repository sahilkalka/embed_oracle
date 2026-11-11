<?php
/* Embedded India Mail — contacts. The address book lives on the mail server, so the
 * same contacts appear in webmail, on phones (CardDAV / ActiveSync) and in Outlook. */
$prefs['_GLOBAL']['pwstore_scheme'] = 'encrypted';
$prefs['_GLOBAL']['loglevel'] = \Psr\Log\LogLevel::WARNING;
$prefs['_GLOBAL']['loglevel_http'] = \Psr\Log\LogLevel::ERROR;

$prefs['EmbeddedIndia'] = [
    'accountname'     => 'Contacts',
    'username'        => '%u',
    'password'        => '%p',
    'discovery_url'   => 'http://nginx:8088/SOGo/dav/%u/',
    'rediscover_time' => '24:00:00',
    'refresh_time'    => '00:10:00',
    'active'          => true,
    'readonly'        => false,
    'hide'            => false,
    'use_categories'  => true,
    'fixed'           => ['accountname', 'username', 'password', 'discovery_url'],
];
