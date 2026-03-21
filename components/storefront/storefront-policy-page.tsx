import { StorefrontColorScheme, StorefrontPolicy } from "@/utils/types/types";

interface StorefrontPolicyPageProps {
  policy: StorefrontPolicy;
  colors: StorefrontColorScheme;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function renderMarkdown(content: string, colors: StorefrontColorScheme) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
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
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
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
          className="font-heading mb-3 mt-8 text-xl font-bold"
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
          className="font-heading mb-2 mt-6 text-lg font-semibold"
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
          dangerouslySetInnerHTML={{ __html: inlineFormat(line) }}
        />
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
    <div className="min-h-screen px-4 pb-16 pt-20 md:px-6">
      <div className="mx-auto max-w-3xl">
        {renderMarkdown(policy.content, colors)}
      </div>
    </div>
  );
}
