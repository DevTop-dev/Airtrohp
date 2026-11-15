import { Children, isValidElement, memo, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';
import { pathFromMeta } from '../../lib/codeblocks';

function nodeText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join('');
  if (isValidElement(n)) return nodeText((n.props as { children?: ReactNode }).children);
  return '';
}

interface CodeProps {
  className?: string;
  children?: ReactNode;
  node?: { data?: { meta?: string } };
}

function Pre({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0] as ReactElement<CodeProps> | undefined;
  const props = (isValidElement(child) ? child.props : {}) as CodeProps;
  const lang = /language-([\w+#-]+)/.exec(props.className ?? '')?.[1] ?? '';
  const path = pathFromMeta(props.node?.data?.meta);
  const raw = nodeText(props.children).replace(/\n$/, '');
  return (
    <CodeBlock lang={lang} path={path} raw={raw}>
      {props.children}
    </CodeBlock>
  );
}

function MarkdownImpl({ content }: { content: string }) {
  return (
    <div className="prose-air break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: Pre as never,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
