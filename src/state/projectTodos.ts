/** Keep the existing newline-based checklist. Source indices include blank lines. */
export function projectTodos(description: string) {
  return description.split("\n").flatMap((line, sourceIndex) => {
    const text = line.trim();
    return text
      ? [
          {
            sourceIndex,
            checked: /^\[x\]\s+/i.test(text),
            text: text.replace(/^\[(?:x| )\]\s+/i, ""),
          },
        ]
      : [];
  });
}
export function changeTodo(
  description: string,
  sourceIndex: number,
  patch: { checked?: boolean; text?: string },
): string {
  const rows = description.split("\n");
  const todo = projectTodos(description).find(
    (item) => item.sourceIndex === sourceIndex,
  );
  if (!todo)
    throw new Error(
      "This TODO changed. Close and reopen the project before trying again.",
    );
  const text = (patch.text ?? todo.text).trim();
  if (!text || /[\r\n]/.test(text))
    throw new Error("A TODO must contain one non-empty line.");
  rows[sourceIndex] =
    `[${(patch.checked ?? todo.checked) ? "x" : " "}] ${text}`;
  return rows.join("\n");
}
