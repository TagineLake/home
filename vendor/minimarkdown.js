/* 轻量 Markdown 渲染器（兜底方案，无需网络/依赖）
 * 支持：标题、粗体、斜体、行内代码、代码块、有序/无序列表、引用、链接、图片、分隔线、段落、简单表格。
 * 仅在前台/后台加载 marked 失败时使用。 */
(function (global) {
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(text) {
    // 代码块先行保护
    text = escapeHtml(text);
    // 图片 ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => `<img alt="${a}" src="${u}" />`);
    // 链接 [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
    // 粗体
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 斜体
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    // 行内代码
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  }
  function parse(src) {
    if (!src) return '';
    const lines = String(src).replace(/\r\n/g, '\n').split('\n');
    let html = '', i = 0;
    while (i < lines.length) {
      let line = lines[i];
      // 代码块 ```
      if (/^```/.test(line)) {
        let code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; // 跳过结束 ```
        html += '<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>';
        continue;
      }
      // 分隔线
      if (/^(\-{3,}|\*{3,})$/.test(line.trim())) { html += '<hr/>'; i++; continue; }
      // 标题
      let h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { const lv = h[1].length; html += `<h${lv}>${inline(h[2])}</h${lv}>`; i++; continue; }
      // 引用
      if (/^>\s?/.test(line)) {
        let quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
        html += '<blockquote>' + inline(quote.join(' ')) + '</blockquote>';
        continue;
      }
      // 表格
      if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        const headers = line.split('|').filter((c, idx, arr) => idx !== 0 && idx !== arr.length - 1 || (arr.length === 3)).map(c => c.trim());
        // 简化：按 | 切分并去除首尾空单元格
        const headCells = splitRow(line);
        i += 2;
        let rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        html += '<table><thead><tr>' + headCells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
        continue;
      }
      // 列表
      if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
        let items = [], ordered = /^\d+\./.test(line.trim());
        while (i < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^(\s*)([-*+]|\d+\.)\s+/, ''));
          i++;
        }
        html += (ordered ? '<ol>' : '<ul>') + items.map(it => `<li>${inline(it)}</li>`).join('') + (ordered ? '</ol>' : '</ul>');
        continue;
      }
      // 空行
      if (line.trim() === '') { i++; continue; }
      // 段落（合并连续非空行）
      let para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|>\s?|```|\s*[-*+]\s|\s*\d+\.\s|(\-{3,}|\*{3,})$)/.test(lines[i]) && !/^\|.*\|\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      html += '<p>' + inline(para.join(' ')) + '</p>';
    }
    return html;
  }
  function splitRow(line) {
    let cells = line.split('|');
    // 去除首尾空（因行首尾的 | ）
    if (cells.length && cells[0].trim() === '') cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(c => c.trim());
  }
  global.MiniMarkdown = { parse: parse };
})(window);
