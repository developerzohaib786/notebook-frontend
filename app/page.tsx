"use client";

import React, { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import { UserButton } from '@clerk/nextjs'


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
    pdf?: any;
    loc?: any;
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

function ContextItem({ doc, index }: { doc: ContextDoc; index: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const filename = doc.metadata?.source?.split(/[\\/]/).pop() ?? "Unknown source";
  const page = doc.metadata?.loc?.pageNumber ?? doc.metadata?.loc?.lines?.from ?? null;

  return (
    <div className="border border-gray-600 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-lime-600 font-mono text-xs shrink-0">#{index + 1}</span>
          <span className="text-sm text-gray-300 truncate">{filename}</span>
          {page && <span className="text-xs text-gray-500 shrink-0">· p.{page}</span>}
        </span>
        <span className="text-gray-400 text-xs ml-2">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 py-3 bg-gray-900 border-t border-gray-700">
          <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{doc.pageContent}</p>
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch(`https://radiant-river-47433-b51b00b90d42.herokuapp.com/pdfs/${user.id}`)
      .then((r) => r.json())
      .then((data) => setDocuments(data.pdfs ?? []))
      .catch((err) => console.error("Failed to fetch PDFs:", err));
  }, [isLoaded, user]);

  useEffect(() => {
    const syncViewportState = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);

      if (previousIsMobileView.current === null) {
        setSidebarOpen(!mobile);
      } else if (previousIsMobileView.current && !mobile) {
        setSidebarOpen(true);
      }

      previousIsMobileView.current = mobile;
    };

    syncViewportState();
    window.addEventListener("resize", syncViewportState);
    return () => window.removeEventListener("resize", syncViewportState);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", user.id);

    try {
      const response = await fetch("https://radiant-river-47433-b51b00b90d42.herokuapp.com/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const newDocument: Document = {
          id: Date.now().toString(),
          pdfUrl: data.pdfUrl,
          userId: user.id,
          originalName: file.name,
        };
        setDocuments((prev) => [...prev, newDocument]);
      } else {
        alert("Failed to upload file");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error uploading file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !user) return;

    const userMessage: Message = {
      id: user.id,
      content: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    const loadingId = (Date.now() + 1).toString();
    const loadingMessage: Message = {
      id: loadingId,
      content: "Thinking...",
      sender: "assistant",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const response = await fetch(
        `https://radiant-river-47433-b51b00b90d42.herokuapp.com/chat?question=${encodeURIComponent(inputMessage)}&userId=${encodeURIComponent(user.id)}`
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      console.log("Chat API Response:", data);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId
            ? {
                ...msg,
                content: data.message,
                timestamp: new Date(),
                context: data.context || [],
              }
            : msg
        )
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingId
            ? {
                ...msg,
                content: "Sorry, something went wrong. Please try again.",
                timestamp: new Date(),
              }
            : msg
        )
      );
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-gray-800 text-white">
      {/* Mobile sidebar backdrop */}
      {isMobileView && sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobileView
            ? `fixed inset-y-0 left-0 z-30 w-72 max-w-[85vw] transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300`
            : `${sidebarOpen ? "w-72" : "w-0"} transition-all duration-300 shrink-0`
        } bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold">📚 Documents</h2>
          {/* Close button — mobile only */}
          {isMobileView && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>

        {/* Upload Button */}
        <div className="p-4 border-b border-gray-700">
          <label className="block">
            <div
              className={`flex items-center justify-center w-full p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-lime-700 hover:bg-gray-700 transition-colors ${
                isUploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept={acceptedFileTypes}
                className="hidden"
                disabled={isUploading}
              />
              <div className="text-center">
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-5 w-5 border-2 border-lime-600 border-t-transparent rounded-full"></div>
                    <span className="text-sm">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-lime-400 mx-auto" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12L8 8m4-4l4 4" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-400">Upload PDF, Word, PPT</p>
                  </>
                )}
              </div>
            </div>
          </label>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-gray-500 pb-3">When a file is downloaded, rename it to add the .pdf extension.</p>
          {documents.length === 0 ? (
            <p className="text-gray-500 text-center mt-8 text-sm">No documents uploaded yet</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                >
                  <span className="text-xl shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.originalName}</p>
                    <a
                      href={getPdfViewUrl(doc.pdfUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-lime-500 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Desktop sidebar toggle — pinned to sidebar edge */}
      {!isMobileView && (
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 -translate-y-1/2 z-10 bg-gray-700 hover:bg-gray-600 transition-colors p-2 rounded-r-lg"
          style={{ left: sidebarOpen ? "288px" : "0px" }}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="p-3 md:p-4 border-b border-gray-700 bg-gray-800 flex items-center gap-3">
          {/* Mobile hamburger — inside the header, left side */}
          {isMobileView && (
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Open sidebar"
              className="shrink-0 bg-gray-700 hover:bg-gray-600 transition-colors p-2 rounded-lg"
            >
              ☰
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-2xl font-bold leading-tight">💬 Notebook Chat</h1>
            <p className="text-gray-400 text-xs md:text-sm hidden sm:block">Ask questions about your documents</p>
          </div>

          <div className="shrink-0">
            <UserButton />
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 px-4">
                <span className="text-5xl md:text-6xl">💭</span>
                <p className="mt-4 text-base md:text-lg">Start a conversation</p>
                <p className="text-sm">Upload documents and ask questions about them</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Assistant message */}
                  {msg.sender === "assistant" && (
                    <div className="max-w-[90%] md:max-w-[80%] p-3 md:p-4 rounded-2xl rounded-bl-md bg-gray-700">
                      <div className="leading-relaxed space-y-2 text-sm md:text-base">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
                            p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || "");
                              const isInline = !match && !String(children).includes("\n");
                              return !isInline && match ? (
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  className="rounded-lg text-xs my-2 !overflow-x-auto"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                              ) : (
                                <code className="bg-gray-900 text-pink-400 px-1 py-0.5 rounded text-xs" {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {msg.context && msg.context.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-600">
                          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
                            Context from Vector Database
                          </p>
                          <div className="space-y-2">
                            {msg.context.map((doc, i) => (
                              <ContextItem key={doc.id ?? i} doc={doc} index={i} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User message */}
                  {msg.sender === "user" && (
                    <>
                      <div className="max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-br-md bg-lime-700 text-sm md:text-base">
                        <p>{msg.content}</p>
                      </div>
                      <div className="shrink-0">
                        <UserButton />
                      </div>
                    </>
                  )}
                </div>
              ))}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-4 border-t border-gray-700 bg-gray-800">
          <div className="flex gap-2 md:gap-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 min-w-0 px-4 py-3 md:py-4 bg-gray-700 border border-gray-600 rounded-xl focus:outline-none focus:border-lime-500 transition-colors text-sm md:text-base"
            />
            <button
              onClick={handleSendMessage}
              className="shrink-0 px-4 md:px-6 py-3 md:py-4 bg-lime-600 rounded-xl hover:bg-lime-500 active:bg-lime-700 transition-colors font-medium text-sm md:text-base"
            >
              <span className="hidden sm:inline">Send </span>➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}