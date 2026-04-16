import { Fragment, type ReactElement, type ReactNode } from "react";
import { StorefrontColorScheme, StorefrontPolicy } from "@/utils/types/types";

interface StorefrontPolicyPageProps {
  policy: StorefrontPolicy;
  colors: StorefrontColorScheme;
}

function renderInline(text: string): ReactNode[] {
  const segments: ReactNode[] = [];
  const inlinePattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      segments.push(<strong key={`strong-${match.index}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      segments.push(<em key={`em-${match.index}`}>{match[2]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  if (segments.length === 0) {
    return [text];
  }

  return segments.map((segment, index) =>
    typeof segment === "string" ? (
      <Fragment key={`text-${index}`}>{segment}</Fragment>
    ) : (
      segment
    )
  );
}

function renderMarkdown(content: string, colors: StorefrontColorScheme) {
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${listKey++}`}
          className="mb-4 list-disc space-y-1 pl-6"
          style={{ color: colors.text + "CC" }}
        >
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1
          key={i}
          className="font-heading mb-6 text-3xl font-bold"
          style={{ color: colors.text }}
        >
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2
          key={i}
          className="font-heading mt-8 mb-3 text-xl font-bold"
          style={{ color: colors.text }}
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3
          key={i}
          className="font-heading mt-6 mb-2 text-lg font-semibold"
          style={{ color: colors.text }}
        >
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p
          key={i}
          className="font-body mb-4 text-sm leading-relaxed"
          style={{ color: colors.text + "CC" }}
        >
          {renderInline(line)}
        </p>
      );
    }
  }

  flushList();
  return elements;
}

export default function StorefrontPolicyPage({
  policy,
  colors,
}: StorefrontPolicyPageProps) {
  return (
    <div className="min-h-screen px-4 pt-20 pb-16 md:px-6">
      <div className="mx-auto max-w-3xl">
        {renderMarkdown(policy.content, colors)}
      </div>
    </div>
  );
}
