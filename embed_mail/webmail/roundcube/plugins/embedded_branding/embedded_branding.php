<?php
/**
 * Embedded India Mail branding.
 *
 * - Embedded India colours, logo and favicon on every page (styles.css + skin_logo config)
 * - Replaces the built-in "About" page (which lists bundled software) with a branded one
 * - Last-line filter that rewrites any leftover upstream product name in rendered pages
 *
 * Open-source licence notices inside static JS/CSS files are intentionally left untouched.
 */
class embedded_branding extends rcube_plugin
{
    public $task = '.*';

    private const BRAND = 'Embedded India Mail';

    public function init()
    {
        $this->include_stylesheet('styles.css');
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('settings_actions', [$this, 'settings_actions']);
        $this->add_hook('send_page', [$this, 'send_page']);
    }

    /** Serve a branded About page instead of the upstream one. */
    public function startup($args)
    {
        if ($args['task'] === 'settings' && $args['action'] === 'about') {
            $rcmail  = rcmail::get_instance();
            $support = htmlspecialchars((string) $rcmail->config->get('support_url'), ENT_QUOTES);
            header('Content-Type: text/html; charset=UTF-8');
            echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' . self::BRAND . '</title>'
               . '<meta name="viewport" content="width=device-width, initial-scale=1">'
               . '<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;padding:32px;color:#192c27}'
               . 'h1{font-size:20px;margin:16px 0 8px}p{color:#4b5d58;line-height:1.6}a{color:#007f5f}</style></head><body>'
               . '<img src="plugins/embedded_branding/assets/logo-login.svg" alt="" height="48">'
               . '<h1>' . self::BRAND . '</h1>'
               . '<p>Secure business email for embeddedindia.in.</p>'
               . ($support ? '<p>Need help? <a href="' . $support . '" target="_blank" rel="noopener">Contact support</a>.</p>' : '')
               . '</body></html>';
            exit;
        }
        return $args;
    }

    /** Keep the About entry out of the Settings menu. */
    public function settings_actions($args)
    {
        if (!empty($args['actions'])) {
            $args['actions'] = array_values(array_filter($args['actions'], function ($a) {
                return ($a['action'] ?? '') !== 'about';
            }));
        }
        return $args;
    }

    /** Final safety net on rendered HTML: no upstream product names in visible text. */
    public function send_page($args)
    {
        $args['content'] = preg_replace(
            ['/\bRoundcube(?: Webmail)?\b(?![._\/-])/', '/\bSOGo\b(?![._\/-])/'],
            self::BRAND,
            $args['content']
        );
        return $args;
    }
}
