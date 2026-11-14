import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteMarkdown } from "../../src/components/NoteMarkdown";

const render = (text: string) => renderToStaticMarkup(createElement(NoteMarkdown, { text }));

describe("note Markdown", () => {
  it("renders basic formatting and lists", () => {
    const html = render("**Bold** *italic* `code`\n\n- Bullet\n\n1. Numbered\n\n[Link](https://example.com)");
    for (const expected of ["<strong>Bold</strong>", "<em>italic</em>", "<code>code</code>", "<ul>", "<ol>", 'href="https://example.com"']) {
      expect(html).toContain(expected);
    }
  });

  it("never interprets raw HTML or dangerous link protocols", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[Bad](javascript:alert(1))\n\n[Bad](data:text/html,hello)');
    expect(html).not.toMatch(/<(script|img)\b/);
    expect(html).not.toMatch(/href="(?:javascript|data):/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves plain text, soft line breaks, and Unicode", () => {
    expect(render("Line one\nLine two\n🙂")).toContain("<p>Line one\nLine two\n🙂</p>");
  });

  it("automatically links web addresses without linking inline code", () => {
    const html = render("https://example.com/path?q=test and www.example.org.\n\n`https://code.example.com`");
    expect(html).toContain('href="https://example.com/path?q=test"');
    expect(html).toContain('href="http://www.example.org"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("<code>https://code.example.com</code>");
    expect(html).not.toContain('href="https://code.example.com"');
  });

  it("keeps blank-line-separated numbered items in one list", () => {
    const html = render("1. test\n\n2. test2\n\n3. test 3");
    expect(html.match(/<ol>/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
    for (const text of ["test", "test2", "test 3"]) {
      expect(html).toContain(`<p>${text}</p>`);
    }
  });
});
