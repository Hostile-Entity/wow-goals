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
});
