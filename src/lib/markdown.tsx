import { type ReactNode } from "react";

/** Minimal, dependency-free markdown renderer tuned for generated output. */

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[S\d+\])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[0.85em] text-ember-400">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-paper-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[S")) {
      nodes.push(
        <span
          key={key}
          className="mx-0.5 rounded border border-mint-500/30 bg-mint-500/10 px-1.5 py-0.5 align-middle font-mono text-[10px] text-mint-400"
        >
          {token.slice(1, -1)}
        </span>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic text-paper-200">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-ink-950/80 p-4"
        >
          {lang && (
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-paper-300/40">
              {lang}
            </div>
          )}
          <code className="font-mono text-[13px] leading-relaxed text-paper-100">
            {code.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base"];
      blocks.push(
        <p
          key={key++}
          className={`mt-5 mb-2 font-display font-semibold text-paper-100 ${sizes[level - 1]}`}
        >
          {inline(heading[2], `h${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 space-y-1.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-paper-200/90">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ember-500" />
              <span>{inline(item, `li${key}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="my-2 space-y-1.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-paper-200/90">
              <span className="font-mono text-xs text-ember-400/80">{idx + 1}.</span>
              <span>{inline(item, `ol${key}-${idx}`)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 border-l-2 border-ember-500/50 pl-4 text-sm italic text-paper-200/80"
        >
          {inline(line.slice(2), `q${key}`)}
        </blockquote>,
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    blocks.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-paper-200/90">
        {inline(line, `p${key}`)}
      </p>,
    );
    i++;
  }

  return <div>{blocks}</div>;
}
