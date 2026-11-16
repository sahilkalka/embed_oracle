import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis);

export interface SanitizeOptions {
  blockRemoteImages?: boolean;
}

export function sanitizeEmailHtml(rawHtml: string, options: SanitizeOptions = {}): {
  cleanHtml: string;
  hasRemoteImages: boolean;
} {
  if (!rawHtml) return { cleanHtml: '', hasRemoteImages: false };

  let hasRemoteImages = false;

  // Configure DOMPurify hooks
  DOMPurify.removeAllHooks();

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Force external links to open in a new tab with noopener
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    // Intercept image sources if blockRemoteImages is active
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
        hasRemoteImages = true;
        if (options.blockRemoteImages) {
          node.setAttribute('data-original-src', src);
          node.setAttribute(
            'src',
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" fill="%23f3f2f1"><rect width="100" height="40" rx="4"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="11" fill="%23a19f9d">Blocked Image</text></svg>'
          );
        }
      }
    }
  });

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'a', 'b', 'blockquote', 'br', 'caption', 'code', 'div', 'em', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small',
      'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
      'th', 'thead', 'tr', 'u', 'ul', 'font', 'center', 'style'
    ],
    ALLOWED_ATTR: [
      'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class',
      'color', 'dir', 'height', 'href', 'id', 'src', 'style', 'target', 'title',
      'width', 'data-original-src'
    ],
    ALLOW_DATA_ATTR: true,
  });

  return { cleanHtml, hasRemoteImages };
}
