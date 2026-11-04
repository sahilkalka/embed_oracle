// src/services/markdown.js
const { marked } = require('marked');
const hljs = require('highlight.js');

let purifyInstance = null;
function getPurify() {
  if (!purifyInstance) {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const window = new JSDOM('').window;
    purifyInstance = DOMPurify(window);
  }
  return purifyInstance;
}

// Use marked.use with custom renderer in Marked v15
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      return `<pre tabindex="0" role="region" aria-label="Scrollable code example" class="max-w-full overflow-x-auto"><code class="hljs language-${language}">${highlighted}</code></pre>`;
    }
  }
});

function renderMarkdown(content) {
  if (!content) return '';
  const rawHtml = marked.parse(content);
  return getPurify().sanitize(rawHtml, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'class', 'tabindex', 'role', 'aria-label']
  });
}

module.exports = {
  renderMarkdown,
  markdownToHtml: renderMarkdown
};
