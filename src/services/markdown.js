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
      return `<div class="code-block-wrapper my-6 max-w-full rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-white/10"><div class="code-block-header px-4 py-2 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between"><span class="font-bold text-slate-300 uppercase">${language}</span><span class="text-[9px] text-slate-500">Scrollable</span></div><pre tabindex="0" role="region" aria-label="Code snippet" class="max-w-full overflow-x-auto bg-[#282c34] m-0 p-0 text-xs sm:text-sm"><code class="hljs language-${language} block min-w-full w-max p-4 bg-[#282c34] text-slate-200">${highlighted}</code></pre></div>`;
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
