import { sanitizeHtml, sanitizeHtmlFallback } from './sanitize-html';

describe('sanitizeHtml (DOM-based)', () => {
  it('keeps the allowed inline formatting tags', () => {
    const input =
      'Check <b>forks</b>, <strong>mast</strong>, <i>tires</i>, <em>horn</em>, <u>seatbelt</u>.<br>Done.';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('removes script tags including their content', () => {
    const output = sanitizeHtml('Safe<script>alert("xss")</script> text');
    expect(output).toBe('Safe text');
    expect(output).not.toContain('alert');
  });

  it('removes style tags including their content', () => {
    const output = sanitizeHtml('<style>body{display:none}</style>Visible');
    expect(output).toBe('Visible');
  });

  it('strips disallowed tags but keeps their text', () => {
    expect(sanitizeHtml('<div><span>Wear</span> a <h1>hard hat</h1></div>')).toBe(
      'Wear a hard hat',
    );
  });

  it('drops on* event handler attributes', () => {
    const output = sanitizeHtml('<b onclick="steal()" onmouseover="bad()">bold</b>');
    expect(output).toBe('<b>bold</b>');
    expect(output).not.toContain('onclick');
  });

  it('drops img/onerror vectors entirely', () => {
    const output = sanitizeHtml('before<img src=x onerror="alert(1)">after');
    expect(output).toBe('beforeafter');
  });

  it('neutralizes javascript: hrefs by unwrapping the link', () => {
    const output = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(output).toBe('click');
    expect(output).not.toContain('javascript');
  });

  it('neutralizes obfuscated javascript: hrefs', () => {
    const output = sanitizeHtml('<a href="  java\nscript:alert(1)">click</a>');
    expect(output).not.toContain('href');
  });

  it('forces rel and target on safe links and drops other attributes', () => {
    const output = sanitizeHtml(
      '<a href="https://www.osha.gov" class="x" onclick="bad()">OSHA</a>',
    );
    expect(output).toContain('href="https://www.osha.gov"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).toContain('target="_blank"');
    expect(output).not.toContain('class');
    expect(output).not.toContain('onclick');
  });

  it('drops data: hrefs', () => {
    const output = sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(output).toBe('x');
  });

  it('removes HTML comments', () => {
    expect(sanitizeHtml('keep<!-- secret -->this')).toBe('keepthis');
  });

  it('handles nested disallowed wrappers around allowed tags', () => {
    expect(sanitizeHtml('<div><p>Stay <strong>alert</strong></p></div>')).toBe(
      'Stay <strong>alert</strong>',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('sanitizeHtmlFallback (no DOM)', () => {
  it('removes script blocks with their content and strips all other tags', () => {
    const output = sanitizeHtmlFallback('<b>Keep</b><script>alert("x")</script> text');
    expect(output).toBe('Keep text');
  });

  it('removes unterminated script blocks', () => {
    expect(sanitizeHtmlFallback('safe<script>alert(1)')).toBe('safe');
  });

  it('strips event handlers along with their tags', () => {
    const output = sanitizeHtmlFallback('<span onclick="bad()">hello</span>');
    expect(output).toBe('hello');
    expect(output).not.toContain('onclick');
  });
});
