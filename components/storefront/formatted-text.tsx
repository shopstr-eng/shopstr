import React from "react";

function parseFormattedText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(
        <strong key={key}>
          <em>{match[2]}</em>
        </strong>
      );
    } else if (match[3]) {
      nodes.push(<strong key={key}>{match[3]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={key}>{match[4]}</em>);
    }

    key++;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

interface FormattedTextProps {
  text: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
}

export default function FormattedText({
  text,
  as: Tag = "span",
  className,
  style,
}: FormattedTextProps) {
  const lines = text.split("\n");
  const content =
    lines.length > 1
      ? lines.map((line, i) => (
          <React.Fragment key={i}>
            {parseFormattedText(line)}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        ))
      : parseFormattedText(text);

  return (
    <Tag className={className} style={style}>
      {content}
    </Tag>
  );
}
