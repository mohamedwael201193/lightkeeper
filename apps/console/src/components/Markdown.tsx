import ReactMarkdown from "react-markdown";

/**
 * Markdown panel — renders the task builder's README markdown properly.
 * react-markdown never executes raw HTML (no rehype-raw), so stray tags stay
 * inert text instead of rendering; the generator also strips the OCTOPUS
 * banner blocks before they reach here.
 */
export default function Markdown({ source }: { source: string }) {
  return (
    <div className="md-panel">
      <ReactMarkdown>{source}</ReactMarkdown>
    </div>
  );
}
