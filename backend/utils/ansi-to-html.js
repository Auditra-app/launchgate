/**
 * ANSI to HTML converter for live terminal streaming
 */
function ansiToHtml(text) {
  if (!text) return '';

  // Escape HTML characters first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ANSI color maps
  const colorMap = {
    '30': 'color: #64748b;', // black / dark gray
    '31': 'color: #f87171;', // red
    '32': 'color: #34d399;', // green
    '33': 'color: #fbbf24;', // yellow
    '34': 'color: #60a5fa;', // blue
    '35': 'color: #c084fc;', // magenta / purple
    '36': 'color: #38bdf8;', // cyan
    '37': 'color: #f1f5f9;', // white
    '90': 'color: #94a3b8;', // bright black (gray)
    '91': 'color: #ef4444;', // bright red
    '92': 'color: #10b981;', // bright green
    '93': 'color: #f59e0b;', // bright yellow
    '94': 'color: #3b82f6;', // bright blue
    '95': 'color: #a855f7;', // bright magenta
    '96': 'color: #06b6d4;', // bright cyan
    '97': 'color: #ffffff;', // bright white
    '1': 'font-weight: 600;', // bold
    '2': 'opacity: 0.7;', // dim
    '3': 'font-style: italic;', // italic
    '4': 'text-decoration: underline;', // underline
  };

  // Convert ANSI color sequences \x1b[...m
  html = html.replace(/\x1b\[([0-9;]+)m/g, (match, p1) => {
    if (p1 === '0' || p1 === '') {
      return '</span>';
    }
    const codes = p1.split(';');
    const styles = codes.map(c => colorMap[c] || '').filter(Boolean).join(' ');
    return `<span style="${styles}">`;
  });

  // Strip remaining escape codes
  html = html.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  return html;
}

module.exports = { ansiToHtml };
