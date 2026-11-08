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
    },
    table(token) {
      let header = '';
      let cell = '';
      for (let j = 0; j < token.header.length; j++) {
        cell += this.tablecell(token.header[j]);
      }
      header += this.tablerow({ text: cell });
      let body = '';
      for (let j = 0; j < token.rows.length; j++) {
        const row = token.rows[j];
        cell = '';
        for (let k = 0; k < row.length; k++) {
          cell += this.tablecell(row[k]);
        }
        body += this.tablerow({ text: cell });
      }
      if (body) body = `<tbody>${body}</tbody>`;
      return `<div class="table-container max-w-full overflow-x-auto my-6 rounded-xl" tabindex="0" role="region" aria-label="Scrollable data table" data-audit-ignore><table class="min-w-full">\n<thead>\n${header}</thead>\n${body}</table>\n</div>`;
    }
  }
});

function renderMarkdown(content) {
  if (!content) return '';
  const rawHtml = marked.parse(content);
  return getPurify().sanitize(rawHtml, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'class', 'tabindex', 'role', 'aria-label', 'data-audit-ignore']
  });
}

module.exports = {
  renderMarkdown,
  markdownToHtml: renderMarkdown
};
