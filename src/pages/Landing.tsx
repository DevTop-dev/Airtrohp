import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Bug,
  ChevronDown,
  Code2,
  Download,
  FolderGit2,
  Layers,
  Menu,
  MessageSquareText,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { Logo, LogoMark } from '../components/ui/Logo';
import { PlanCards } from '../components/ui/PlanCards';
import { useAuth } from '../context/AuthContext';
import { useDocTitle, usePublicConfig } from '../hooks/useMisc';
import { PATREON_URL } from '../lib/config';

function Navbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how', label: 'How it works' },
    { href: '#pricing', label: 'Membership' },
    { href: '#faq', label: 'FAQ' },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-ink-300 transition hover:text-ink-50">{l.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/chat" className="btn-primary btn-sm">Open Airtrohp <ArrowRight size={14} /></Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost btn-sm">Log in</Link>
              <Link to="/register" className="btn-primary btn-sm">Create account</Link>
            </>
          )}
        </div>
        <button className="rounded-lg p-2 text-ink-200 hover:bg-ink-800 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-ink-800 bg-ink-950 px-5 pb-5 pt-3 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-sm text-ink-200">{l.label}</a>
          ))}
          <div className="mt-3 grid gap-2">
            {user ? (
              <Link to="/chat" className="btn-primary">Open Airtrohp</Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary">Create account</Link>
                <Link to="/login" className="btn-secondary">Log in</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function HeroDemo() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-4xl animate-fade-up [animation-delay:200ms]">
      <div className="absolute -inset-x-10 -top-10 bottom-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_65%)]" />
      <div className="relative overflow-hidden rounded-2xl border border-ink-600 bg-ink-900 shadow-glow">
        <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-500" />
          <span className="ml-3 text-xs text-ink-400">airtrohp / new conversation</span>
        </div>
        <div className="space-y-5 p-5 text-left sm:p-7">
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-xs">Y</div>
            <p className="pt-0.5 text-sm text-ink-50">Add a slash command to my Discord.js v14 bot that times out a user for a given duration.</p>
          </div>
          <div className="flex gap-3">
            <LogoMark size={28} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="pt-0.5 text-sm leading-6 text-ink-200">Here is a complete <code className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-50">/timeout</code> command with permission checks and error handling:</p>
              <div className="overflow-hidden rounded-xl border border-ink-600 bg-ink-950">
                <div className="border-b border-ink-700 bg-ink-800 px-3.5 py-1.5 font-mono text-xs text-ink-300">src/commands/timeout.js</div>
                <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-ink-200">
                  <code>
                    <span className="font-semibold text-white">const</span> {'{ SlashCommandBuilder, PermissionFlagsBits }'} = <span className="font-semibold text-white">require</span>(<span className="text-ink-200">'discord.js'</span>);{'\n\n'}
                    module.exports = {'{'}{'\n'}
                    {'  '}data: <span className="font-semibold text-white">new</span> SlashCommandBuilder(){'\n'}
                    {'    '}.setName(<span className="text-ink-200">'timeout'</span>){'\n'}
                    {'    '}.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),{'\n'}
                    {'  '}<span className="text-ink-500">{'// …execute(), validation, audit-log reason'}</span>{'\n'}
                    {'}'};
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Code2, title: 'Complete programs', body: 'Full applications and websites, not fragments. Every file, every import, ready to run.' },
  { icon: Bug, title: 'Debug and fix', body: 'Paste an error or attach your code. Airtrohp finds the root cause and returns the fix.' },
  { icon: Bot, title: 'Discord bots', body: 'Discord.js v14 bots with slash commands, events, moderation and clean project structure.' },
  { icon: Layers, title: 'Multi-file projects', body: 'Upload several files or a whole ZIP. Airtrohp reasons across the codebase, not one file at a time.' },
  { icon: Wand2, title: 'Refactor and optimize', body: 'Cleaner structure, faster code and fewer bugs, with an explanation for every change.' },
  { icon: FolderGit2, title: 'Project workspace', body: 'Keep project files in your account and chat with the full context whenever you return.' },
  { icon: Zap, title: 'Streaming responses', body: 'Answers appear as they are written, with syntax highlighting and one-click copy.' },
  { icon: Download, title: 'Downloadable output', body: 'Generated files download individually or as a ZIP, with the paths already in place.' },
];

const STEPS = [
  { n: '01', title: 'Ask', body: 'Open Airtrohp and start typing. Five messages are free, with no account and no card.' },
  { n: '02', title: 'Refine', body: 'Attach files, edit a message, regenerate a response. The conversation keeps its context.' },
  { n: '03', title: 'Ship', body: 'Download the generated files or ZIP, or save them to your workspace and keep building.' },
];

const FAQ = [
  { q: 'What is Airtrohp?', a: 'Airtrohp is an all-round AI assistant. Ask it anything: explanations, writing, translation, study help, ideas and planning. It is also an expert coder: complete programs and websites, debugging, refactoring, architecture and Discord bots. For code it supports the common languages and frameworks, including JavaScript, TypeScript, Python, C, C++, Java, C#, PHP, SQL, Go, Rust, Kotlin, Swift, React, Next.js, Node.js, Vue, Angular, Tailwind, Firebase, Supabase and Cloudflare Workers.' },
  { q: 'Do I need an account to try it?', a: 'No. Every visitor gets five free messages immediately. The limit is counted on our server using a signed guest session and network-level checks, so a simple refresh does not reset it. After that, create a free account to continue; your guest conversation moves into it.' },
  { q: 'What do the memberships include?', a: 'Free accounts get 50 messages a day and conversation history. Airtrohp Pro is $9.99 per month and adds unlimited chat, advanced assistance, multi-file project help and early access to new features. An Ultimate tier is being prepared.' },
  { q: 'How does billing work?', a: 'Memberships are handled through Patreon. You pledge on Patreon, connect your Patreon account to Airtrohp, and our servers verify the membership directly with Patreon. If you cancel or a payment fails, Pro access is removed automatically.' },
  { q: 'Is my code private?', a: 'Your conversations and project files are stored in your own account and are only readable by you. To generate answers, your messages and attachments are sent to Google’s Gemini API through our servers. Do not paste secrets such as passwords or private keys into any AI tool.' },
  { q: 'Can Airtrohp run my code?', a: 'No. Airtrohp reads and writes code but never executes uploaded files. ZIP uploads are filtered and read as text only.' },
];

export default function Landing() {
  useDocTitle();
  const { config } = usePublicConfig();
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 text-center sm:pt-28">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 py-1.5 text-xs text-ink-200">
              <Sparkles size={13} /> {config.guestLimit} free messages. No account needed.
            </span>
          </div>
          <h1 className="mx-auto mt-8 max-w-4xl animate-fade-up font-display text-[2.9rem] leading-[1.02] text-ink-50 [animation-delay:80ms] sm:text-7xl md:text-[5.5rem]">
            The AI that writes, debugs and <em className="text-shine not-italic">ships</em> your code.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl animate-fade-up text-base leading-7 text-ink-300 [animation-delay:140ms] sm:text-lg">
            Airtrohp is your all-round AI assistant: answers, writing, study help, ideas and code. Precise answers, streamed instantly, in the language you speak.
          </p>
          <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 [animation-delay:200ms] sm:flex-row">
            <Link to="/chat" className="btn-primary !px-7 !py-3.5 text-[15px]">
              Start chatting <ArrowRight size={16} />
            </Link>
            {user ? (
              <Link to="/dashboard" className="btn-secondary !px-7 !py-3.5 text-[15px]">Open dashboard</Link>
            ) : (
              <Link to="/register" className="btn-secondary !px-7 !py-3.5 text-[15px]">Create free account</Link>
            )}
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* Languages */}
      <section className="border-y border-ink-800 bg-ink-900/60 py-7">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 text-sm text-ink-300">
          {['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'C++', 'PHP', 'Kotlin', 'Swift', 'SQL', 'React', 'Next.js', 'Node.js', 'Discord.js'].map((l) => (
            <span key={l} className="tracking-wide">{l}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Capabilities</p>
          <h2 className="mt-4 font-display text-4xl text-ink-50 sm:text-5xl">Everything a developer reaches for, in one place.</h2>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="group bg-ink-900 p-7 transition hover:bg-ink-850">
              <f.icon size={22} className="text-ink-200 transition group-hover:text-white" />
              <h3 className="mt-5 text-[15px] font-medium text-ink-50">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-300">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-ink-800 bg-ink-900/50 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl text-ink-50 sm:text-5xl">From idea to working code in three steps.</h2>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-ink-600 pt-6">
                <span className="font-display text-5xl text-ink-500">{s.n}</span>
                <h3 className="mt-4 text-lg font-medium text-ink-50">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-300">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Membership</p>
          <h2 className="mt-4 font-display text-4xl text-ink-50 sm:text-5xl">Start free. Upgrade when you outgrow it.</h2>
          <p className="mt-4 text-sm text-ink-300">Memberships are managed through Patreon. Cancel any time.</p>
        </div>
        <div className="mt-14">
          <PlanCards
            config={config}
            renderAction={(t) =>
              !t.enabled ? (
                <button className="btn-secondary w-full" disabled>Coming soon</button>
              ) : t.id === 'free' ? (
                <Link to="/register" className="btn-secondary w-full">Start free</Link>
              ) : (
                user ? (
                  <a href={config.patreonJoinUrl ?? PATREON_URL} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">Get {t.name}</a>
                ) : (
                  <Link to="/register" className="btn-primary w-full">Get {t.name}</Link>
                )
              )
            }
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-24">
        <p className="eyebrow">FAQ</p>
        <h2 className="mt-4 font-display text-4xl text-ink-50 sm:text-5xl">Questions, answered.</h2>
        <div className="mt-10 divide-y divide-ink-700 border-y border-ink-700">
          {FAQ.map((f, i) => (
            <div key={f.q}>
              <button
                className="flex w-full items-center justify-between gap-4 py-5 text-left text-[15px] font-medium text-ink-50"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                {f.q}
                <ChevronDown size={18} className={clsx('shrink-0 text-ink-300 transition', openFaq === i && 'rotate-180')} />
              </button>
              {openFaq === i && <p className="animate-fade-in pb-6 pr-8 text-sm leading-7 text-ink-300">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-800 bg-ink-900/60">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-5 py-24 text-center">
          <MessageSquareText size={28} className="text-ink-300" />
          <h2 className="mt-6 font-display text-4xl text-ink-50 sm:text-6xl">Your next project starts with one message.</h2>
          <Link to="/chat" className="btn-primary mt-10 !px-8 !py-3.5 text-[15px]">Try Airtrohp free <ArrowRight size={16} /></Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-800">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-ink-300">The all-round AI assistant for everything you do.</p>
          </div>
          <div>
            <p className="eyebrow mb-4">Product</p>
            <ul className="space-y-2.5 text-sm text-ink-300">
              <li><Link to="/chat" className="hover:text-ink-50">Chat</Link></li>
              <li><a href="#pricing" className="hover:text-ink-50">Membership</a></li>
              <li><a href="#faq" className="hover:text-ink-50">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-4">Account</p>
            <ul className="space-y-2.5 text-sm text-ink-300">
              <li><Link to="/login" className="hover:text-ink-50">Log in</Link></li>
              <li><Link to="/register" className="hover:text-ink-50">Create account</Link></li>
              <li><Link to="/dashboard" className="hover:text-ink-50">Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-800 py-6 text-center text-xs text-ink-400">© {new Date().getFullYear()} Airtrohp. All rights reserved.</div>
      </footer>
    </div>
  );
}
