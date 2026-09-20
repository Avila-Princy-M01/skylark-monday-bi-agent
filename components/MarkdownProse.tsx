"use client";

import React from "react";

interface MarkdownProseProps {
  content: string;
}

export function MarkdownProse({ content }: MarkdownProseProps) {
  if (!content) return null;

  // Split into structural blocks (paragraphs, lists, section headers)
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-1">
          {currentList.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs md:text-sm text-[#D8D8D8] leading-relaxed"
            >
              <span className="text-cyan-400 font-black select-none mt-0.5">•</span>
              <span className="flex-1">{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Check if line is a bullet item (- , * , • )
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1]);
      continue;
    }

    flushList();

    // Check if line is a standalone markdown header (e.g. **Header**, ### Header)
    const headerMatch = trimmed.match(/^(?:#{1,4}\s+|\*\*)([^*#]+)\*\*?$/);
    const isDisclaimerHeader = /assumptions|caveats|data quality/i.test(trimmed);

    if (headerMatch && trimmed.startsWith("**") && trimmed.endsWith("**")) {
      elements.push(
        <div
          key={`h-${elements.length}`}
          className={`font-bold tracking-wide mt-4 mb-1.5 flex items-center gap-2 ${
            isDisclaimerHeader
              ? "text-[11px] uppercase tracking-widest text-[#888] pt-3 border-t border-[#222]"
              : "text-sm text-cyan-300"
          }`}
        >
          <span>{headerMatch[1].trim()}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={`p-${elements.length}`}
        className="text-xs md:text-sm text-[#E0E0E0] leading-relaxed my-2"
      >
        {formatInline(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className="font-mono space-y-1">{elements}</div>;
}

/** Formats inline elements like **bold** and `code` */
function formatInline(text: string): React.ReactNode {
  // Regex to match **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-white tracking-wide">
          {inner}
        </strong>
      );
    }
    return part;
  });
}
