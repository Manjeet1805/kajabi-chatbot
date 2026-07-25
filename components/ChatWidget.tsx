"use client";

import { useEffect, useRef, useState } from "react";
import {
    ArrowUp,
    BookOpen,
    ChevronLeft,
    Expand,
    RotateCcw,
    Shrink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clientCourseConfig } from "@/lib/client-course-config";

type Source = {
    id: string;
    type: string;
    category: string;
    module?: string;
    moduleNumber?: number;
    lesson?: string;
    title: string;
    similarity: number;
};

type SourceDisplay = {
    hasModule: boolean;
    moduleLabel: string;
    detailLabel?: string;
};

type Message = {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
};

type SseEvent = {
    event: string;
    data: {
        text?: string;
        error?: string;
        sources?: Source[];
    };
};

const MAX_STORED_MESSAGES = 30;
const LAUNCHER_COLLAPSED_STORAGE_KEY =
    `${clientCourseConfig.storageKey}-launcher-collapsed`;

const INITIAL_MESSAGES: Message[] = [
    {
        role: "assistant",
        content: clientCourseConfig.text.initialMessage,
    },
];

function loadStoredMessages(): Message[] {
    if (typeof window === "undefined") {
        return INITIAL_MESSAGES;
    }

    try {
        const raw = window.localStorage.getItem(
            clientCourseConfig.storageKey
        );

        if (!raw) {
            return INITIAL_MESSAGES;
        }

        const parsed = JSON.parse(raw) as Message[];

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return INITIAL_MESSAGES;
        }

        return parsed;
    } catch {
        return INITIAL_MESSAGES;
    }
}

function saveStoredMessages(messages: Message[]) {
    if (typeof window === "undefined") {
        return;
    }

    const cleanMessages = messages
        .filter(
            (message) =>
                message.content.trim().length > 0
        )
        .slice(-MAX_STORED_MESSAGES);

    window.localStorage.setItem(
        clientCourseConfig.storageKey,
        JSON.stringify(cleanMessages)
    );
}

function parseSseChunk(chunk: string): Array<SseEvent | null> {
    const events = chunk.split("\n\n").filter(Boolean);

    return events.map((eventBlock) => {
        const lines = eventBlock.split("\n");

        const eventLine = lines.find((line) =>
            line.startsWith("event: ")
        );

        const dataLine = lines.find((line) =>
            line.startsWith("data: ")
        );

        if (!eventLine || !dataLine) {
            return null;
        }

        try {
            return {
                event: eventLine
                    .replace("event: ", "")
                    .trim(),

                data: JSON.parse(
                    dataLine
                        .replace("data: ", "")
                        .trim()
                ),
            } satisfies SseEvent;
        } catch {
            return null;
        }
    });
}

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] =
        useState(false);
    const [isMobileHost, setIsMobileHost] =
        useState(false);
    const [isLauncherCollapsed, setIsLauncherCollapsed] =
        useState(false);
    const [isLauncherReady, setIsLauncherReady] =
        useState(false);

    const [messages, setMessages] =
        useState<Message[]>(INITIAL_MESSAGES);

    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] =
        useState(false);

    const [isStorageReady, setIsStorageReady] =
        useState(false);

    const messagesEndRef =
        useRef<HTMLDivElement | null>(null);

    const shouldAnimateIframeRef = useRef(false);

    useEffect(() => {
        setMessages(loadStoredMessages());
        setIsStorageReady(true);

        const searchParams = new URLSearchParams(
            window.location.search
        );

        setIsMobileHost(
            searchParams.get("hostMobile") === "true"
        );

        try {
            const storedValue = window.localStorage.getItem(
                LAUNCHER_COLLAPSED_STORAGE_KEY
            );

            setIsLauncherCollapsed(storedValue === "true");
        } catch {
            setIsLauncherCollapsed(false);
        } finally {
            setIsLauncherReady(true);
        }
    }, []);

    useEffect(() => {
        if (!isStorageReady || isLoading) {
            return;
        }

        saveStoredMessages(messages);
    }, [messages, isLoading, isStorageReady]);

    useEffect(() => {
        if (!isLauncherReady) {
            return;
        }

        let width = "128px";
        let height = "128px";

        if (isOpen) {
            width = isMobileHost
                ? "100vw"
                : isExpanded
                    ? "620px"
                    : "430px";

            height = isMobileHost
                ? "100dvh"
                : "640px";

        } else if (isLauncherCollapsed) {
            width = "64px";
            height = "96px";
        }

        window.parent.postMessage(
            {
                type: "KAJABI_CHATBOT_SIZE",
                width,
                height,
                animateIframe:
                shouldAnimateIframeRef.current,
            },
            "*"
        );

        shouldAnimateIframeRef.current = false;
    }, [
        isOpen,
        isExpanded,
        isLauncherCollapsed,
        isLauncherReady,
        isMobileHost,
    ]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    }, [messages, isLoading, isOpen]);

    function resetConversation() {
        setMessages(INITIAL_MESSAGES);

        window.localStorage.removeItem(
            clientCourseConfig.storageKey
        );
    }

    function collapseLauncher() {
        shouldAnimateIframeRef.current = true;

        setIsOpen(false);
        setIsLauncherCollapsed(true);

        try {
            window.localStorage.setItem(
                LAUNCHER_COLLAPSED_STORAGE_KEY,
                "true"
            );
        } catch {
        }
    }

    function restoreLauncher() {
        shouldAnimateIframeRef.current = true;

        setIsLauncherCollapsed(false);

        try {
            window.localStorage.setItem(
                LAUNCHER_COLLAPSED_STORAGE_KEY,
                "false"
            );
        } catch {
        }
    }

    function getSourceDisplay(
        source: Source
    ): SourceDisplay {
        if (source.moduleNumber && source.module) {
            return {
                hasModule: true,

                moduleLabel:
                    `${clientCourseConfig.text.module} ` +
                    `${source.moduleNumber} · ${source.module}`,

                detailLabel:
                    source.lesson || source.title,
            };
        }

        if (source.moduleNumber) {
            return {
                hasModule: true,

                moduleLabel:
                    `${clientCourseConfig.text.module} ` +
                    `${source.moduleNumber}`,

                detailLabel:
                    source.lesson || source.title,
            };
        }

        return {
            hasModule: false,
            moduleLabel: source.title,
        };
    }

    async function sendMessage() {
        const text = input.trim();

        if (!text || isLoading) {
            return;
        }

        const assistantMessageIndex =
            messages.length + 1;

        setMessages((previousMessages) => [
            ...previousMessages,
            {
                role: "user",
                content: text,
            },
            {
                role: "assistant",
                content: "",
                sources: [],
            },
        ]);

        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    message: text,
                    history: messages.slice(-8),
                }),
            });

            if (!response.ok) {
                const data = await response
                    .json()
                    .catch(() => null);

                throw new Error(
                    data?.error ||
                    clientCourseConfig.text
                        .chatbotError
                );
            }

            if (!response.body) {
                throw new Error(
                    clientCourseConfig.text.noResponse
                );
            }

            const reader =
                response.body.getReader();

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } =
                    await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, {
                    stream: true,
                });

                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const parsedEvents =
                        parseSseChunk(
                            `${part}\n\n`
                        );

                    for (const parsedEvent of parsedEvents) {
                        if (!parsedEvent) {
                            continue;
                        }

                        if (
                            parsedEvent.event ===
                            "sources"
                        ) {
                            setMessages(
                                (previousMessages) =>
                                    previousMessages.map(
                                        (
                                            message,
                                            index
                                        ) =>
                                            index ===
                                            assistantMessageIndex
                                                ? {
                                                    ...message,
                                                    sources:
                                                        parsedEvent
                                                            .data
                                                            .sources ??
                                                        [],
                                                }
                                                : message
                                    )
                            );
                        }

                        if (
                            parsedEvent.event ===
                            "delta"
                        ) {
                            setMessages(
                                (previousMessages) =>
                                    previousMessages.map(
                                        (
                                            message,
                                            index
                                        ) =>
                                            index ===
                                            assistantMessageIndex
                                                ? {
                                                    ...message,
                                                    content:
                                                        message.content +
                                                        (parsedEvent
                                                                .data
                                                                .text ??
                                                            ""),
                                                }
                                                : message
                                    )
                            );
                        }

                        if (
                            parsedEvent.event ===
                            "error"
                        ) {
                            throw new Error(
                                parsedEvent.data
                                    .error ||
                                clientCourseConfig
                                    .text
                                    .chatbotError
                            );
                        }
                    }
                }
            }
        } catch (error) {
            setMessages((previousMessages) =>
                previousMessages.map(
                    (message, index) =>
                        index ===
                        assistantMessageIndex
                            ? {
                                ...message,

                                content:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : clientCourseConfig
                                            .text
                                            .genericError,
                            }
                            : message
                )
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 max-sm:inset-0 max-sm:bottom-auto max-sm:right-auto max-sm:pointer-events-none">
            {isOpen && (
                <div
                    className={`mb-4 flex h-[520px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl transition-[width] duration-200 max-sm:pointer-events-auto max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:shadow-none ${
                        isExpanded
                            ? "w-[550px]"
                            : "w-[360px]"
                    }`}
                >
                    <div className="flex items-center justify-between bg-black px-5 py-4 text-white">
                        <div>
                            <p className="text-sm font-semibold">
                                {
                                    clientCourseConfig.assistantName
                                }
                            </p>

                            <p className="text-xs text-white/70">
                                {
                                    clientCourseConfig.text
                                        .subtitle
                                }
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={
                                    resetConversation
                                }
                                aria-label={
                                    clientCourseConfig
                                        .text.resetChat
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <RotateCcw
                                    size={16}
                                    strokeWidth={2.2}
                                />
                            </button>

                            <button
                                onClick={() =>
                                    setIsExpanded(
                                        (previous) =>
                                            !previous
                                    )
                                }
                                aria-label={
                                    isExpanded
                                        ? clientCourseConfig
                                            .text
                                            .shrinkChat
                                        : clientCourseConfig
                                            .text
                                            .expandChat
                                }
                                className={`h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white ${
                                    isMobileHost ? "hidden" : "flex"
                                }`}
                            >
                                {isExpanded ? (
                                    <Shrink
                                        size={17}
                                        strokeWidth={
                                            2.2
                                        }
                                    />
                                ) : (
                                    <Expand
                                        size={17}
                                        strokeWidth={
                                            2.2
                                        }
                                    />
                                )}
                            </button>

                            <button
                                onClick={() =>
                                    setIsOpen(false)
                                }
                                aria-label={
                                    clientCourseConfig
                                        .text.closeChat
                                }
                                className={`h-9 w-9 items-center justify-center rounded-full text-2xl font-light text-white/80 transition hover:bg-white/10 hover:text-white ${
                                    isMobileHost ? "flex" : "hidden"
                                }`}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto bg-neutral-50 p-4">
                        {messages.map(
                            (message, index) => {
                                const isLatestStreamingMessage =
                                    isLoading &&
                                    index ===
                                    messages.length -
                                    1 &&
                                    message.role ===
                                    "assistant";

                                return (
                                    <div
                                        key={index}
                                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                            message.role ===
                                            "user"
                                                ? "ml-auto bg-black text-white"
                                                : "mr-auto bg-white text-black shadow-sm"
                                        }`}
                                    >
                                        {message.content ? (
                                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0">
                                                <ReactMarkdown
                                                    remarkPlugins={[
                                                        remarkGfm,
                                                    ]}
                                                >
                                                    {
                                                        message.content
                                                    }
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <span className="typing-dot" />
                                                <span className="typing-dot typing-dot-delay-1" />
                                                <span className="typing-dot typing-dot-delay-2" />
                                            </div>
                                        )}

                                        {message.role ===
                                            "assistant" &&
                                            message.content.trim()
                                                .length >
                                            0 &&
                                            !isLatestStreamingMessage &&
                                            message.sources &&
                                            message.sources
                                                .length >
                                            0 && (
                                                <div className="mt-3 rounded-xl border border-black/10 bg-neutral-50 p-3 text-xs text-neutral-600">
                                                    <p className="mb-2 font-semibold text-neutral-800">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <BookOpen
                                                                size={
                                                                    14
                                                                }
                                                                strokeWidth={
                                                                    2.2
                                                                }
                                                            />

                                                            {
                                                                clientCourseConfig
                                                                    .text
                                                                    .sources
                                                            }{" "}
                                                            (
                                                            {
                                                                message
                                                                    .sources
                                                                    .length
                                                            }
                                                            )
                                                        </span>
                                                    </p>

                                                    <div className="space-y-2">
                                                        {message.sources.map(
                                                            (
                                                                source
                                                            ) => {
                                                                const sourceDisplay =
                                                                    getSourceDisplay(
                                                                        source
                                                                    );

                                                                return (
                                                                    <div
                                                                        key={
                                                                            source.id
                                                                        }
                                                                        className="rounded-lg border border-black/5 bg-white px-3 py-2"
                                                                    >
                                                                        <p className="flex items-start gap-1.5 font-semibold text-neutral-800">
                                                                            {sourceDisplay.hasModule && (
                                                                                <BookOpen
                                                                                    size={
                                                                                        13
                                                                                    }
                                                                                    strokeWidth={
                                                                                        2.2
                                                                                    }
                                                                                    className="mt-0.5 shrink-0 text-neutral-500"
                                                                                />
                                                                            )}

                                                                            <span>
                                                                                {
                                                                                    sourceDisplay.moduleLabel
                                                                                }
                                                                            </span>
                                                                        </p>

                                                                        {sourceDisplay.detailLabel && (
                                                                            <p className="mt-0.5 pl-[19px] text-[11px] text-neutral-500">
                                                                                {
                                                                                    sourceDisplay.detailLabel
                                                                                }
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                    </div>
                                );
                            }
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t bg-white p-3 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center gap-2 rounded-3xl border border-black/10 bg-neutral-50 px-3 py-2 shadow-sm">
                            <input
                                value={input}
                                onChange={(event) =>
                                    setInput(
                                        event.target.value
                                    )
                                }
                                onKeyDown={(event) => {
                                    if (
                                        event.key ===
                                        "Enter" &&
                                        !event.shiftKey
                                    ) {
                                        event.preventDefault();
                                        void sendMessage();
                                    }
                                }}
                                placeholder={
                                    clientCourseConfig.text
                                        .inputPlaceholder
                                }
                                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[16px] text-black placeholder:text-neutral-400 outline-none sm:text-sm"
                            />

                            <button
                                onClick={() =>
                                    void sendMessage()
                                }
                                disabled={
                                    isLoading ||
                                    input.trim()
                                        .length === 0
                                }
                                aria-label={
                                    clientCourseConfig
                                        .text.sendMessage
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-lg font-semibold text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-white"
                            >
                                <ArrowUp
                                    size={18}
                                    strokeWidth={2.5}
                                />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isLauncherCollapsed && (
                <div className="dsu-launcher-main max-sm:pointer-events-auto max-sm:fixed max-sm:bottom-4 max-sm:right-4">
                    {!isOpen && (
                        <button
                            type="button"
                            onClick={collapseLauncher}
                            aria-label="Chatbot ausblenden"
                            className="dsu-launcher-dismiss"
                        >
                            ×
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            setIsOpen(
                                (previous) => !previous
                            )
                        }
                        aria-label={
                            isOpen
                                ? clientCourseConfig.text
                                    .closeChat
                                : clientCourseConfig.text
                                    .openChat
                        }
                        className={`dsu-ai-button ${
                            isOpen ? "dsu-ai-button-open" : ""
                        } ${
                            isOpen && isMobileHost
                                ? "hidden"
                                : ""
                        }`}
                    >
                        <span className="dsu-ai-orbit dsu-ai-orbit-one" />
                        <span className="dsu-ai-orbit dsu-ai-orbit-two" />

                        <span className="dsu-ai-inner">
                            {isOpen ? (
                                <span className="dsu-ai-close">
                                    ×
                                </span>
                            ) : (
                                <img
                                    src="/dsu_chatbot_logo.webp"
                                    alt={`${clientCourseConfig.assistantName} Chatbot`}
                                    className="dsu-ai-image"
                                />
                            )}
                        </span>
                    </button>
                </div>
            )}

            {isLauncherCollapsed && (
                <button
                    type="button"
                    onClick={restoreLauncher}
                    aria-label="Chatbot wieder einblenden"
                    className="dsu-launcher-restore max-sm:pointer-events-auto"
                >
                    <ChevronLeft
                        size={20}
                        strokeWidth={2.4}
                    />
                </button>
            )}
        </div>
    );
}