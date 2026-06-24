import { type ReactElement, type ReactNode } from "react";
import { StorefrontColorScheme, StorefrontPolicy } from "@/utils/types/types";

interface StorefrontPolicyPageProps {
  policy: StorefrontPolicy;
  colors: StorefrontColorScheme;
}

function findClosingMarker(
  text: string,
  start: number,
  marker: "*" | "**"
): number {
  let j = start;
  while (j < text.length) {
    if (text[j] === "\\" && j + 1 < text.length) {
      j += 2;
      continue;
    }
    if (marker === "**") {
      if (text[j] === "*" && text[j + 1] === "*") return j;
    } else {
      if (text[j] === "*" && text[j + 1] !== "*") return j;
    }
    j++;
  }
  return -1;
}

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let i = 0;
  let counter = 0;

  const flushBuffer = () => {
    if (buffer.length > 0) {
      nodes.push(buffer);
      buffer = "";
    }
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1]!;
      if (next === "*" || next === "\\") {
        buffer += next;
        i += 2;
        continue;
      }
    }

    if (ch === "*") {
      const isBold = text[i + 1] === "*";
      const marker: "*" | "**" = isBold ? "**" : "*";
      const contentStart = i + marker.length;
      const closeIdx = findClosingMarker(text, contentStart, marker);

      if (closeIdx > contentStart) {
        flushBuffer();
        const inner = text.slice(contentStart, closeIdx);
        const key = `${keyPrefix}-${isBold ? "b" : "e"}-${counter++}`;
        const innerNodes = renderInline(inner, `${key}-n`);
        nodes.push(
          isBold ? (
            <strong key={key}>{innerNodes}</strong>
          ) : (
            <em key={key}>{innerNodes}</em>
          )
        );
        i = closeIdx + marker.length;
        continue;
      }
    }

    buffer += ch;
    i++;
  }

  flushBuffer();
  return nodes.length > 0 ? nodes : [text];
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
              <span>{renderInline(item, `li-${listKey}-${i}`)}</span>
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
          {renderInline(line, `p-${i}`)}
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
