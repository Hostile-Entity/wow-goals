import Markdown from "react-markdown";

export function NoteMarkdown({ text }: { text: string }) {
  return (
    <div className="note-markdown">
      <Markdown
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
