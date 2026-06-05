"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useUser, UserButton } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5003";

interface Document {
  id: string;
  pdfUrl: string;
  userId: string;
  originalName: string;
}

interface ContextDoc {
  pageContent: string;
  metadata: {
    source: string;
    pdf?: unknown;
    loc?: {
      pageNumber?: number;
      lines?: { from?: number };
    };
  };
  id?: string;
}

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
  context?: ContextDoc[];
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !String(children).includes("\n");
    if (!isInline && match) {
      return (
        <pre className="my-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--forest-deep)] px-4 py-3 text-xs text-[#f3eee6]">
          <code className="font-mono" {...props}>{String(children).replace(/\n$/, "")}</code>
        </pre>
      );
    }
    return (
      <code className="rounded bg-[var(--forest-deep)] px-1 py-0.5 text-xs text-[#f3eee6]" {...props}>
        {children}
      </code>
    );
  },
};

function ContextItem({ doc, index }: { doc: ContextDoc; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const filename = doc.metadata?.source?.split(/[\\/]/).pop() ?? "Unknown source";
  const page = doc.metadata?.loc?.pageNumber ?? doc.metadata?.loc?.lines?.from ?? null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-solid)]/90 shadow-[var(--shadow-soft)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-[var(--forest)]">#{index + 1}</span>
          <span className="truncate text-sm text-[var(--ink)]">{filename}</span>
          {page && <span className="shrink-0 text-xs text-[var(--muted)]">· p.{page}</span>}
        </span>
        <span className="ml-2 text-xs text-[var(--muted)]">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--line)] bg-white/40 px-3 py-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">{doc.pageContent}</p>
        </div>
      )}
    </div>
  );
}

function getPdfViewUrl(cloudinaryUrl: string): string {
  return cloudinaryUrl;
}

export default function NotebookPage() {
  const { user, isLoaded } = useUser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const previousIsMobileView = useRef<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const acceptedFileTypes = ".pdf";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Fetch existing PDFs ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !user) return;

    const url = `${API_BASE}/pdfs/${user.id}`;
    console.log("[PDFs] Fetching documents from:", url);

    fetch(url)
      .then(async (res) => {
        console.log("[PDFs] Response status:", res.status, res.statusText);
        if (!res.ok) {
          const text = await res.text();
          console.error("[PDFs] ❌ Non-OK response:", text);
          return;
        }
        const data = await res.json();
        console.log("[PDFs] ✅ Received:", data);
        setDocuments(data.pdfs ?? []);
      })
      .catch((err) => {
        console.error("[PDFs] ❌ Network error:", err.message);
      });
  }, [isLoaded, user]);

  // ─── Viewport / sidebar ──────────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);
      if (previousIsMobileView.current === null) setSidebarOpen(!mobile);
      else if (previousIsMobileView.current && !mobile) setSidebarOpen(true);
      previousIsMobileView.current = mobile;
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // ─── Upload ──────────────────────────────────────────────────────────────────
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log("[Upload] File selected:", file?.name, file?.type, file?.size, "bytes");

    if (!file) {
      console.warn("[Upload] No file selected");
      return;
    }
    if (!user) {
      console.error("[Upload] ❌ No authenticated user");
      return;
    }
    if (file.type !== "application/pdf") {
      console.error("[Upload] ❌ Wrong file type:", file.type);
      alert("Only PDF files are supported.");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", user.id);

    // Log what's actually in the FormData
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`[Upload] FormData["${key}"] = File(${value.name}, ${value.type}, ${value.size}b)`);
      } else {
        console.log(`[Upload] FormData["${key}"] = "${value}"`);
      }
    }

    const url = `${API_BASE}/upload/`;
    console.log("[Upload] POST →", url);

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        // DO NOT set Content-Type manually — the browser must set it with
        // the multipart boundary. Setting it manually breaks the upload.
      });

      console.log("[Upload] Response status:", response.status, response.statusText);
      console.log("[Upload] Response headers:", {
        "content-type": response.headers.get("content-type"),
      });

      const responseText = await response.text();
      console.log("[Upload] Raw response body:", responseText);

      if (!response.ok) {
        console.error("[Upload] ❌ Upload failed:", responseText);
        alert(`Upload failed (${response.status}): ${responseText}`);
        return;
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("[Upload] ❌ Response is not valid JSON:", responseText);
        alert("Upload succeeded but server returned unexpected response.");
        return;
      }

      console.log("[Upload] ✅ Success:", data);

      const newDocument: Document = {
        id: data.id ?? Date.now().toString(),
        pdfUrl: data.pdfUrl,
        userId: user.id,
        originalName: file.name,
      };

      setDocuments((prev) => [...prev, newDocument]);
      console.log("[Upload] Document added to local state");
    } catch (err: any) {
      console.error("[Upload] ❌ Network/fetch error:", err.message);
      alert(`Network error during upload: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) {
      console.warn("[Chat] Empty message, ignoring");
      return;
    }
    if (!user) {
      console.error("[Chat] ❌ No authenticated user");
      return;
    }

    // FIX: use a unique ID per message, not user.id (which is always the same)
    const userMessageId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMessageId,
      content: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    console.log("[Chat] Sending message:", { id: userMessageId, content: inputMessage });
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    const loadingId = `assistant-${Date.now() + 1}`;
    setMessages((prev) => [
      ...prev,
      { id: loadingId, content: "Thinking...", sender: "assistant", timestamp: new Date() },
    ]);

    const url = `${API_BASE}/chat?question=${encodeURIComponent(inputMessage)}&userId=${encodeURIComponent(user.id)}`;
    console.log("[Chat] GET →", url);

    try {
      const response = await fetch(url);
      console.log("[Chat] Response status:", response.status, response.statusText);

      const responseText = await response.text();
      console.log("[Chat] Raw response (first 500 chars):", responseText.slice(0, 500));

      if (!response.ok) {
        console.error("[Chat] ❌ Non-OK response:", responseText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? { ...m, content: `Error ${response.status}: ${responseText}`, timestamp: new Date() }
              : m
          )
        );
        return;
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("[Chat] ❌ Response is not valid JSON:", responseText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? { ...m, content: "Server returned an invalid response.", timestamp: new Date() }
              : m
          )
        );
        return;
      }

      console.log("[Chat] ✅ Answer received:", {
        messageLength: data.message?.length,
        contextChunks: data.context?.length,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? { ...m, content: data.message, timestamp: new Date(), context: data.context || [] }
            : m
        )
      );
    } catch (err: any) {
      console.error("[Chat] ❌ Network error:", err.message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? { ...m, content: `Network error: ${err.message}`, timestamp: new Date() }
            : m
        )
      );
    }
  };

  return (
    <div className="relative isolate flex h-[100dvh] overflow-hidden bg-[var(--app-bg)] text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute left-[-10%] top-[-15%] h-72 w-72 rounded-full bg-[rgba(142,155,130,0.14)] blur-3xl" />
        <div className="absolute right-[-8%] top-[10%] h-80 w-80 rounded-full bg-[rgba(217,123,102,0.12)] blur-3xl" />
        <div className="absolute bottom-[-12%] left-[20%] h-72 w-72 rounded-full bg-[rgba(45,75,65,0.08)] blur-3xl" />
      </div>

      {isMobileView && sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-[#22372f]/35 backdrop-blur-[1px] md:hidden"
        />
      )}

      <div
        className={`${
          isMobileView
            ? `fixed inset-y-0 left-0 z-30 w-72 max-w-[85vw] transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300`
            : `${sidebarOpen ? "w-72" : "w-0"} shrink-0 transition-all duration-300`
        } flex flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--surface)]/95 shadow-[var(--shadow-soft)] backdrop-blur-xl`}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
              <Image src="/logo.png" alt="Neural Hub logo" fill sizes="40px" className="object-contain p-1.5" priority />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">Clinical archive</p>
              <h2 className="truncate text-lg font-semibold text-[var(--forest)]">Documents</h2>
            </div>
          </div>
          {isMobileView && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-[var(--muted)] transition-colors hover:bg-white/70 hover:text-[var(--ink)]"
              aria-label="Close sidebar"
            >✕</button>
          )}
        </div>

        <div className="border-b border-[var(--line)] p-4">
          <label className="block">
            <div
              className={`flex w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[var(--line)] p-4 transition-colors hover:border-[var(--forest)] hover:bg-white/70 ${
                isUploading ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                accept={acceptedFileTypes}
                className="hidden"
                disabled={isUploading}
              />
              <div className="text-center">
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--forest)] border-t-transparent" />
                    <span className="text-sm text-[var(--forest)]">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <svg className="mx-auto h-8 w-8 text-[var(--forest)]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12L8 8m4-4l4 4" />
                    </svg>
                    <p className="mt-2 text-sm text-[var(--muted)]">Upload PDF Documents</p>
                  </>
                )}
              </div>
            </div>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="pb-3 text-xs text-[var(--muted)]">When a file is downloaded, rename it to add the .pdf extension.</p>
          {documents.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--muted)]">No documents uploaded yet</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)]/90 p-3 transition-colors hover:bg-white/75"
                >
                  <span className="shrink-0 text-xl">📄</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">{doc.originalName}</p>
                    <a
                      href={getPdfViewUrl(doc.pdfUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--forest)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >View</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!isMobileView && (
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 z-10 -translate-y-1/2 rounded-r-xl border border-l-0 border-[var(--line)] bg-[var(--surface)]/95 p-2 text-[var(--forest)] shadow-[var(--shadow-soft)] transition-colors hover:bg-white"
          style={{ left: sidebarOpen ? "288px" : "0px" }}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)]/85 p-3 backdrop-blur-xl md:p-4">
          {isMobileView && (
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Open sidebar"
              className="shrink-0 rounded-lg border border-[var(--line)] bg-white/70 p-2 text-[var(--forest)] transition-colors hover:bg-white"
            >☰</button>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
                <Image src="/logo.png" alt="Neural Hub logo" fill sizes="44px" className="object-contain p-1.5" priority />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">Neural Hub inspired workspace</p>
                <h1 className="truncate text-lg font-semibold leading-tight text-[var(--forest)] md:text-2xl">AI Medical Records Management Agent</h1>
              </div>
            </div>
            <p className="hidden text-xs text-[var(--muted)] sm:block md:text-sm">Ask questions about your documents</p>
          </div>
          <div className="shrink-0"><UserButton /></div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3 pb-24 md:p-4 md:pb-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--surface)]/75 px-6 py-10 text-center text-[var(--muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
                <span className="text-5xl md:text-6xl">◌</span>
                <p className="mt-4 text-base font-medium text-[var(--forest)] md:text-lg">Start a conversation</p>
                <p className="text-sm">Upload documents and ask questions about them</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.id} className={`flex items-end gap-2 ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
                  {message.sender === "assistant" && (
                    <div className="max-w-[90%] rounded-3xl rounded-bl-md border border-[var(--line)] bg-[var(--surface)]/92 p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl md:max-w-[80%] md:p-4">
                      <div className="space-y-2 text-sm leading-relaxed text-[var(--ink)] md:text-base">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      {message.context && message.context.length > 0 && (
                        <div className="mt-4 border-t border-[var(--line)] pt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                            Retrieved data from Vector Database
                          </p>
                          <div className="space-y-2">
                            {message.context.map((doc, index) => (
                              <ContextItem key={doc.id ?? index} doc={doc} index={index} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {message.sender === "user" && (
                    <>
                      <div className="max-w-[80%] rounded-3xl rounded-br-md bg-[var(--forest)] px-4 py-3 text-sm text-white shadow-[var(--shadow-soft)] md:max-w-[70%] md:text-base">
                        <p>{message.content}</p>
                      </div>
                      <div className="shrink-0"><UserButton /></div>
                    </>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 border-t border-[var(--line)] bg-[var(--surface)]/90 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl md:p-4 md:pb-4">
          <div className="flex gap-2 md:gap-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type your message..."
              className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--forest)] focus:outline-none md:py-4 md:text-base"
            />
            <button
              onClick={handleSendMessage}
              className="shrink-0 rounded-2xl bg-[var(--forest)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-deep)] active:bg-[var(--forest)] md:px-6 md:py-4 md:text-base"
            >
              <span className="hidden sm:inline">Send </span>➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}