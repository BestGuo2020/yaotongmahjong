import MarkdownIt from 'markdown-it'
import rulesSource from '../../docs/幺筒麻将规则-v1.0.md?raw'

const markdown = new MarkdownIt({ html: false, breaks: true })
markdown.renderer.rules.table_open = (tokens, index, options, _env, renderer) =>
  `<div class="rules-source-table">${renderer.renderToken(tokens, index, options)}`
markdown.renderer.rules.table_close = (tokens, index, options, _env, renderer) =>
  `${renderer.renderToken(tokens, index, options)}</div>\n`

export const yaotongRulesHtml = markdown.render(rulesSource)
