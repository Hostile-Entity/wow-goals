import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function NoteMarkdown({ text }: { text: string }) {
  return (
    <div className="note-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
        allowedElements={[
          "p", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "br", "blockquote",
        ]}
        unwrapDisallowed
      >
        {text}
      </Markdown>
    </div>
  );
}
