import {
  ChatAttachment,
  ChatMessageDto,
  ChatMessageRole,
  ChatSessionDto,
  FinalizeResponseDto,
} from '@sre/shared-types';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
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

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  // Bootstrap a session on mount
  useEffect(() => {
    void (async () => {
      const res = await api.post<ChatSessionDto>('/chat/sessions');
      setSessionId(res.data.id);
      setMessages([
        {
          id: 'system-welcome',
          role: ChatMessageRole.AGENT,
          content:
            "Hi! I'm the SRE intake agent. Tell me what's going wrong — describe the issue, the affected area, and any error messages you've seen. You can attach screenshots too.",
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

        // Parse SSE frames
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

          if (eventName === 'done') {
            // End of stream — no further frames will arrive
            break;
          }

          if (eventName === 'incident-created') {
            // Auto-finalize succeeded inside the same SSE response
            try {
              const parsed = JSON.parse(dataLine) as { incidentId: string };
              setFinalized({ sessionId: sessionId!, incidentId: parsed.incidentId });
            } catch {
              /* ignore parse errors */
            }
            continue;
          }

          if (eventName === 'finalize-error') {
            // Auto-finalize failed — surface the manual button as fallback
            setReadyToFinalize(true);
            try {
              const parsed = JSON.parse(dataLine) as { message: string };
              agentText += `\n\n[Auto-finalize failed: ${parsed.message}. You can retry with the button below.]`;
            } catch {
              /* ignore */
            }
            continue;
          }

          if (eventName === 'agent-done') {
            // The agent finished its reply; auto-finalize may follow
            continue;
          }

          if (eventName === 'error') {
            agentText += `\n[error: ${dataLine}]`;
          } else if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine) as { delta?: string };
              if (parsed.delta) agentText += parsed.delta;
            } catch {
              /* ignore parse errors on partial frames */
            }
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === agentMsg.id ? { ...m, content: agentText } : m)),
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
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">SRE Agent Intake</h1>
          <p className="text-xs text-slate-500">Signed in as {user?.email}</p>
        </div>
        <button
          onClick={() => logout()}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {finalized && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="font-semibold">Ticket created 🎉</div>
              <div className="mt-1 text-sm">
                Incident <code className="rounded bg-white px-1">{finalized.incidentId}</code>{' '}
                is being triaged. The team has been notified.
              </div>
            </div>
          )}
        </div>
      </div>

      {!finalized && (
        <form
          onSubmit={handleSubmit}
          className="border-t bg-white px-6 py-4"
        >
          <div className="mx-auto max-w-3xl space-y-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <span
                    key={i}
                    className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    📎 {a.mimeType}
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="ml-2 text-slate-500 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe the issue…"
                rows={2}
                disabled={streaming}
                className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-center text-sm text-slate-700 hover:bg-slate-100">
                  📎
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAttach}
                    className="hidden"
                  />
                </label>
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
            {readyToFinalize && (
              <button
                type="button"
                onClick={handleFinalize}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
              >
                ✅ Open ticket — the agent has all the info it needs
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === ChatMessageRole.USER;
  const visibleContent = message.content.replace(READY_TOKEN, '').trim();
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-white text-slate-800 shadow-sm border border-slate-200'
        }`}
      >
        {visibleContent || (message.pending ? '…' : '')}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
