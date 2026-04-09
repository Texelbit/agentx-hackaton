import {
  ChatAttachment,
  ChatMessageDto,
  ChatMessageRole,
  ChatSessionDto,
  FinalizeResponseDto,
} from '@sre/shared-types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Image as ImageIcon,
  LifeBuoy,
  LogOut,
  Paperclip,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { GradientMesh } from '../components/GradientMesh';
import { cn } from '../lib/cn';
import { api, logout } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

const READY_TOKEN = '<<READY_TO_FINALIZE>>';

interface DisplayMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  pending?: boolean;
}

export function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [readyToFinalize, setReadyToFinalize] = useState(false);
  const [finalized, setFinalized] = useState<FinalizeResponseDto | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streaming]);

  useEffect(() => {
    void (async () => {
      const res = await api.post<ChatSessionDto>('/chat/sessions');
      setSessionId(res.data.id);
      setMessages([
        {
          id: 'system-welcome',
          role: ChatMessageRole.AGENT,
          content:
            "Hi! I'm here to help you report an incident. Tell me what's happening — what you expected, what actually occurred, and any error messages you've seen. Feel free to attach screenshots too.",
        },
      ]);
    })();
  }, []);

  async function handleAttach(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    const newAttachments: ChatAttachment[] = [];
    for (const file of files) {
      const data = await fileToBase64(file);
      newAttachments.push({ mimeType: file.type, data });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!sessionId || !input.trim() || streaming) return;

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: ChatMessageRole.USER,
      content: input,
    };
    const agentMsg: DisplayMessage = {
      id: `agent-${Date.now()}`,
      role: ChatMessageRole.AGENT,
      content: '',
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, agentMsg]);
    const sentInput = input;
    const sentAttachments = attachments;
    setInput('');
    setAttachments([]);
    setStreaming(true);

    try {
      const accessToken = useAuthStore.getState().accessToken;
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ content: sentInput, attachments: sentAttachments }),
        },
      );
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let agentText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7);
            if (line.startsWith('data: ')) dataLine += line.slice(6);
          }

          if (eventName === 'done') break;

          if (eventName === 'incident-created') {
            try {
              const parsed = JSON.parse(dataLine) as { incidentId: string };
              setFinalized({ sessionId: sessionId!, incidentId: parsed.incidentId });
            } catch {
              /* ignore */
            }
            continue;
          }

          if (eventName === 'finalize-error') {
            setReadyToFinalize(true);
            try {
              const parsed = JSON.parse(dataLine) as { message: string };
              agentText += `\n\n[Auto-finalize failed: ${parsed.message}.]`;
            } catch {
              /* ignore */
            }
            continue;
          }

          if (eventName === 'agent-done') continue;

          if (eventName === 'error') {
            agentText += `\n[error: ${dataLine}]`;
          } else if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine) as { delta?: string };
              if (parsed.delta) agentText += parsed.delta;
            } catch {
              /* ignore */
            }
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsg.id ? { ...m, content: agentText } : m,
            ),
          );
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsg.id
            ? { ...m, content: `Error: ${(err as Error).message}` }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMsg.id ? { ...m, pending: false } : m)),
      );
      textareaRef.current?.focus();
    }
  }

  async function handleFinalize(): Promise<void> {
    if (!sessionId) return;
    try {
      const res = await api.post<FinalizeResponseDto>(
        `/chat/sessions/${sessionId}/finalize`,
      );
      setFinalized(res.data);
    } catch (err) {
      alert(`Failed to finalize: ${(err as Error).message}`);
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-zinc-950">
      {/* Mesh background */}
      <GradientMesh />

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 border-b border-zinc-800/60 bg-zinc-950/60 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow">
              <LifeBuoy className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">SRE Agent Intake</h1>
              <p className="text-[11px] text-zinc-500">
                Signed in as <span className="text-zinc-300">{user?.email}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </motion.header>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streaming &&
              messages[messages.length - 1]?.content === '' && (
                <TypingIndicator />
              )}
          </AnimatePresence>

          {finalized && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="my-6 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-6 shadow-[0_0_40px_-10px_rgba(16,185,129,0.4)]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-500/40">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-emerald-300">
                    Ticket created successfully 🎉
                  </h3>
                  <p className="mt-1 text-xs text-emerald-200/80">
                    Your incident{' '}
                    <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                      {finalized.incidentId.slice(0, 8)}
                    </code>{' '}
                    is being triaged. The team has been notified via email and
                    Slack.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* New incident button — only when chat is finalized */}
      {finalized && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 border-t border-zinc-800/60 bg-zinc-950/60 backdrop-blur-xl"
        >
          <div className="mx-auto max-w-3xl px-6 py-4">
            <button
              onClick={async () => {
                setFinalized(null);
                setReadyToFinalize(false);
                setMessages([]);
                setInput('');
                setAttachments([]);
                const res = await api.post<ChatSessionDto>('/chat/sessions');
                setSessionId(res.data.id);
                setMessages([
                  {
                    id: 'system-welcome',
                    role: ChatMessageRole.AGENT,
                    content:
                      "Hi! I'm here to help you report an incident. Tell me what's happening — what you expected, what actually occurred, and any error messages you've seen. Feel free to attach screenshots too.",
                  },
                ]);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-400 shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)] transition hover:bg-brand-500/20 hover:text-brand-300"
            >
              <LifeBuoy className="h-4 w-4" />
              Report another incident
            </button>
          </div>
        </motion.div>
      )}

      {/* Composer */}
      {!finalized && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 border-t border-zinc-800/60 bg-zinc-950/60 backdrop-blur-xl"
        >
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-6 py-4">
            {/* Attachments preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 flex flex-wrap gap-2"
                >
                  {attachments.map((a, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-300"
                    >
                      <ImageIcon className="h-3 w-3 text-zinc-500" />
                      {a.mimeType.split('/')[1] ?? 'file'}
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                        className="ml-1 text-zinc-500 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ready to finalize manual button */}
            <AnimatePresence>
              {readyToFinalize && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  type="button"
                  onClick={handleFinalize}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_40px_-10px_rgba(16,185,129,0.6)] transition hover:bg-emerald-500"
                >
                  <Sparkles className="h-4 w-4" />
                  Open ticket — the agent has everything it needs
                </motion.button>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2 shadow-lg transition focus-within:border-brand-500/50 focus-within:ring-4 focus-within:ring-brand-500/10">
              <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200">
                <Paperclip className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAttach}
                  className="hidden"
                />
              </label>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e as unknown as FormEvent);
                  }
                }}
                placeholder="Describe the issue..."
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none"
                style={{ maxHeight: '120px' }}
              />
              <motion.button
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.05 }}
                type="submit"
                disabled={streaming || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-[0_0_20px_-4px_rgba(99,102,241,0.6)] transition hover:bg-brand-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-600">
              Press{' '}
              <kbd className="rounded bg-zinc-800 px-1 font-mono">Enter</kbd> to
              send ·{' '}
              <kbd className="rounded bg-zinc-800 px-1 font-mono">Shift+Enter</kbd>{' '}
              for newline
            </p>
          </form>
        </motion.div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === ChatMessageRole.USER;
  const visibleContent = message.content.replace(READY_TOKEN, '').trim();
  if (!visibleContent && !message.pending) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          isUser
            ? 'bg-gradient-to-br from-zinc-700 to-zinc-800 text-zinc-300 ring-1 ring-zinc-700'
            : 'bg-gradient-to-br from-brand-500/20 to-brand-700/20 text-brand-400 ring-1 ring-brand-500/30',
        )}
      >
        {isUser ? 'You' : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-600 text-white shadow-[0_0_20px_-8px_rgba(99,102,241,0.4)]'
            : 'border border-zinc-800 bg-zinc-900/60 text-zinc-200 shadow-sm backdrop-blur-sm',
        )}
      >
        <div className="whitespace-pre-wrap">{visibleContent || '…'}</div>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-3"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-brand-700/20 text-brand-400 ring-1 ring-brand-500/30">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 backdrop-blur-sm">
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
        />
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
        />
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
        />
      </div>
    </motion.div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
