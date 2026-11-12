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
    private $active_skin = 'outlook';

    private function resolve_active_skin()
    {
        $skin_file = getenv('EI_WEBMAIL_SKIN_FILE') ?: dirname(__DIR__, 2) . '/config/ei-skin.json';
        if (is_file($skin_file) && is_readable($skin_file)) {
            $raw = @file_get_contents($skin_file);
            if ($raw !== false) {
                $data = json_decode($raw, true);
                if (is_array($data) && isset($data['skin'])) {
                    $skin = strtolower(trim((string) $data['skin']));
                    if ($skin === 'default' || $skin === 'outlook') {
                        return $skin;
                    }
                }
            }
        }
        return 'outlook';
    }

    public function init()
    {
        $this->active_skin = $this->resolve_active_skin();
        $this->include_stylesheet('styles.css');
        $this->include_script('app.js');
        if ($this->active_skin === 'outlook') {
            $this->include_stylesheet('outlook.css');
            $this->include_script('outlook.js');
        }
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('render_page', [$this, 'render_page']);
        $this->add_hook('settings_actions', [$this, 'settings_actions']);
        $this->add_hook('send_page', [$this, 'send_page']);
    }

    /** Point Elastic's blank reading pane iframe at our branded watermark page. */
    public function render_page($args)
    {
        $rcmail = rcmail::get_instance();
        if (isset($rcmail->output) && method_exists($rcmail->output, 'set_env')) {
            $rcmail->output->set_env(
                'blankpage',
                'plugins/embedded_branding/watermark.html?skin=' . $this->active_skin
            );
        }
        return $args;
    }

    /** Serve a branded About page instead of the upstream one. */
    public function startup($args)
    {
        if ($args['task'] === 'settings' && $args['action'] === 'about') {
            $rcmail  = rcmail::get_instance();
            $support = htmlspecialchars((string) $rcmail->config->get('support_url'), ENT_QUOTES);
            $is_outlook = ($this->active_skin === 'outlook');
            $accent = $is_outlook ? '#0078d4' : '#007f5f';
            $logo = $is_outlook
                ? 'plugins/embedded_branding/assets/outlook-logo-login.svg'
                : 'plugins/embedded_branding/assets/logo-login.svg';
            header('Content-Type: text/html; charset=UTF-8');
            echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' . self::BRAND . '</title>'
               . '<meta name="viewport" content="width=device-width, initial-scale=1">'
               . '<style>body{font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;margin:0;padding:32px;color:#192c27}'
               . 'h1{font-size:20px;margin:16px 0 8px}p{color:#4b5d58;line-height:1.6}a{color:' . $accent . '}</style></head><body>'
               . '<img src="' . $logo . '" alt="" height="48">'
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
        // Roundcube's framed submit handler (app.js) verifies this hidden meta tag; rewriting
        // it causes a false "Connection Error (Failed to reach the server)!" after sending.
        $args['content'] = preg_replace(
            '/(<meta\b[^>]*\bname=[\'"]generator[\'"][^>]*\bcontent=[\'"])' . preg_quote(self::BRAND, '/') . '([\'"])/i',
            '$1Roundcube$2',
            $args['content']
        );
        // Remove stray separator bullet in #login-footer when productname/version are hidden.
        $args['content'] = preg_replace(
            '/(<div\b[^>]*id=[\'"]login-footer[\'"][^>]*>)(?:&nbsp;|&#160;|\s)*(?:&bull;|&#8226;|\x{2022})(?:&nbsp;|&#160;|\s)*/iu',
            '$1',
            $args['content']
        );
        // Replace Elastic's blankpage watermark (Roundcube sphere/cube logo) for both skins.
        $watermark = 'plugins/embedded_branding/watermark.html?skin=' . $this->active_skin;
        $fallback_logo = $this->active_skin === 'outlook'
            ? 'plugins/embedded_branding/assets/outlook-logo-login.svg'
            : 'plugins/embedded_branding/assets/logo-login.svg';
        $args['content'] = preg_replace(
            '/skins\/elastic\/watermark\.html(?:\?[^"\'\s<]*)?/i',
            $watermark,
            $args['content']
        );
        $args['content'] = str_replace(
            'skins/elastic/images/logo.svg',
            $fallback_logo,
            $args['content']
        );
        if ($this->active_skin === 'outlook') {
            $args['content'] = preg_replace_callback(
                '/<html\b([^>]*)>/i',
                function ($m) {
                    $attrs = $m[1];
                    if (preg_match('/\bclass=[\'"]([^\'"]*)[\'"]/i', $attrs)) {
                        $attrs = preg_replace('/(\bclass=[\'"])([^\'"]*)([\'"])/i', '$1$2 ei-skin-outlook$3', $attrs, 1);
                    } else {
                        $attrs .= ' class="ei-skin-outlook"';
                    }
                    return '<html' . $attrs . '>';
                },
                $args['content'],
                1
            );
            $args['content'] = str_replace(
                [
                    'plugins/embedded_branding/assets/logo-login.svg',
                    'plugins/embedded_branding/assets/logo-mark.svg',
                    'plugins/embedded_branding/assets/logo.svg',
                    'plugins/embedded_branding/assets/favicon.svg',
                ],
                [
                    'plugins/embedded_branding/assets/outlook-logo-login.svg',
                    'plugins/embedded_branding/assets/outlook-logo.svg',
                    'plugins/embedded_branding/assets/outlook-logo.svg',
                    'plugins/embedded_branding/assets/outlook-favicon.svg',
                ],
                $args['content']
            );
        }
        return $args;
    }
}
