"use client";

import {
    type ChangeEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    ArrowUp,
    BookOpen,
    ChevronLeft,
    Expand,
    ImagePlus,
    RotateCcw,
    Shrink,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clientCourseConfig } from "@/lib/client-course-config";
import { heicTo } from "heic-to";

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
    imageUrl?: string;
};

type SelectedImage = {
    dataUrl: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    name: string;
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
const MAX_IMAGE_FILE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 5_000_000;
const MAX_IMAGE_DIMENSION = 1600;

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
        .map(({ imageUrl: _imageUrl, ...message }) => message)
        .slice(-MAX_STORED_MESSAGES);

    window.localStorage.setItem(
        clientCourseConfig.storageKey,
        JSON.stringify(cleanMessages)
    );
}


function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }

            reject(new Error("IMAGE_READ_FAILED"));
        };

        reader.onerror = () => {
            reject(new Error("IMAGE_READ_FAILED"));
        };

        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () =>
            reject(new Error("IMAGE_READ_FAILED"));

        image.src = dataUrl;
    });
}

function getFileExtension(fileName: string): string {
    const parts = fileName.toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() ?? "" : "";
}

function isHeicFile(file: File): boolean {
    const extension = getFileExtension(file.name);

    return (
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        extension === "heic" ||
        extension === "heif"
    );
}

async function convertHeicToJpeg(file: File): Promise<File> {
    try {
        const convertedBlob = await heicTo({
            blob: file,
            type: "image/jpeg",
            quality: 0.92,
        });

        const originalNameWithoutExtension =
            file.name.replace(/\.(heic|heif)$/i, "");

        return new File(
            [convertedBlob],
            `${originalNameWithoutExtension}.jpg`,
            {
                type: "image/jpeg",
                lastModified: Date.now(),
            }
        );
    } catch (error) {
        console.error("HEIC conversion failed:", error);
        throw new Error("IMAGE_PROCESSING_FAILED");
    }
}

async function prepareImage(file: File): Promise<SelectedImage> {
    const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    ];

    const allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "heic",
        "heif",
    ];

    const extension = getFileExtension(file.name);

    const isAllowed =
        allowedMimeTypes.includes(file.type) ||
        allowedExtensions.includes(extension);

    if (!isAllowed) {
        throw new Error("IMAGE_TYPE_NOT_ALLOWED");
    }

    if (file.size > MAX_IMAGE_FILE_SIZE) {
        throw new Error("IMAGE_TOO_LARGE");
    }

    let processableFile = file;

    if (isHeicFile(file)) {
        try {
            processableFile = await convertHeicToJpeg(file);
        } catch (error) {
            console.error("HEIC conversion failed:", error);
            throw new Error("IMAGE_PROCESSING_FAILED");
        }
    }

    const originalDataUrl =
        await readFileAsDataUrl(processableFile);

    const image = await loadImage(originalDataUrl);

    const largestDimension = Math.max(
        image.naturalWidth,
        image.naturalHeight
    );

    if (
        !Number.isFinite(largestDimension) ||
        largestDimension <= 0
    ) {
        throw new Error("IMAGE_PROCESSING_FAILED");
    }

    const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / largestDimension
    );

    const width = Math.max(
        1,
        Math.round(image.naturalWidth * scale)
    );

    const height = Math.max(
        1,
        Math.round(image.naturalHeight * scale)
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("IMAGE_PROCESSING_FAILED");
    }

    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL(
        "image/webp",
        0.75
    );

    if (
        !dataUrl.startsWith("data:image/webp") ||
        dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH
    ) {
        throw new Error(
            "IMAGE_TOO_LARGE_AFTER_PROCESSING"
        );
    }

    return {
        dataUrl,
        mimeType: "image/webp",
        name: file.name,
    };
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
    const [selectedImage, setSelectedImage] =
        useState<SelectedImage | null>(null);
    const [imageError, setImageError] =
        useState<string | null>(null);
    const [isPreparingImage, setIsPreparingImage] =
        useState(false);
    const [isLoading, setIsLoading] =
        useState(false);

    const [isStorageReady, setIsStorageReady] =
        useState(false);

    const messagesEndRef =
        useRef<HTMLDivElement | null>(null);
    const fileInputRef =
        useRef<HTMLInputElement | null>(null);

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
                : "720px";

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
        setSelectedImage(null);
        setImageError(null);

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

    async function handleImageSelection(
        event: ChangeEvent<HTMLInputElement>
    ) {
        const file = event.target.files?.[0];

        event.target.value = "";

        if (!file) {
            return;
        }

        setImageError(null);
        setIsPreparingImage(true);

        try {
            const preparedImage = await prepareImage(file);
            setSelectedImage(preparedImage);
        } catch (error) {
            const code =
                error instanceof Error ? error.message : "";

            if (code === "IMAGE_TYPE_NOT_ALLOWED") {
                setImageError(
                    clientCourseConfig.text.imageTypeError
                );
            } else if (
                code === "IMAGE_TOO_LARGE" ||
                code === "IMAGE_TOO_LARGE_AFTER_PROCESSING"
            ) {
                setImageError(
                    clientCourseConfig.text.imageSizeError
                );
            } else {
                setImageError(
                    clientCourseConfig.text.imageProcessingError
                );
            }
        } finally {
            setIsPreparingImage(false);
        }
    }

    async function sendMessage() {
        const text = input.trim();
        const imageToSend = selectedImage;

        if (
            (!text && !imageToSend) ||
            isLoading ||
            isPreparingImage
        ) {
            return;
        }

        const displayText =
            text || clientCourseConfig.text.defaultImageMessage;

        const assistantMessageIndex =
            messages.length + 1;

        setMessages((previousMessages) => [
            ...previousMessages,
            {
                role: "user",
                content: displayText,
                imageUrl: imageToSend?.dataUrl,
            },
            {
                role: "assistant",
                content: "",
                sources: [],
            },
        ]);

        setInput("");
        setSelectedImage(null);
        setImageError(null);
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
                    image: imageToSend
                        ? {
                            dataUrl: imageToSend.dataUrl,
                            mimeType: imageToSend.mimeType,
                        }
                        : undefined,
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
        <div
            className={`fixed z-50 ${
                isMobileHost
                    ? "inset-0 pointer-events-none"
                    : "bottom-6 right-6"
            }`}
        >
            {isOpen && (
                <div
                    className={`flex flex-col overflow-hidden bg-white ${
                        isMobileHost
                            ? "pointer-events-auto fixed inset-0 z-50 h-[100dvh] w-screen max-w-none rounded-none border-0 shadow-none"
                            : `absolute bottom-[90px] right-0 h-[520px] max-w-[calc(100vw-32px)] rounded-3xl border border-black/10 shadow-2xl transition-[width] duration-200 ${
                                isExpanded
                                    ? "w-[550px]"
                                    : "w-[360px]"
                            }`
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
                                        {message.imageUrl && (
                                            <img
                                                src={message.imageUrl}
                                                alt={
                                                    clientCourseConfig
                                                        .text
                                                        .attachedImage
                                                }
                                                className="mb-3 max-h-48 w-full rounded-xl object-contain"
                                            />
                                        )}

                                        {message.content ? (
                                            <div className="max-w-none">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        h1: ({ children }) => (
                                                            <h1 className="mb-4 mt-6 text-lg font-bold leading-tight first:mt-0">
                                                                {children}
                                                            </h1>
                                                        ),

                                                        h2: ({ children }) => (
                                                            <h2 className="mb-3 mt-6 text-base font-bold leading-tight first:mt-0">
                                                                {children}
                                                            </h2>
                                                        ),

                                                        h3: ({ children }) => (
                                                            <h3 className="mb-3 mt-5 text-sm font-bold leading-tight first:mt-0">
                                                                {children}
                                                            </h3>
                                                        ),

                                                        p: ({ children }) => (
                                                            <p className="mb-4 leading-relaxed last:mb-0">
                                                                {children}
                                                            </p>
                                                        ),

                                                        ul: ({ children }) => (
                                                            <ul className="mb-4 mt-2 list-disc space-y-2 pl-5 last:mb-0">
                                                                {children}
                                                            </ul>
                                                        ),

                                                        ol: ({ children }) => (
                                                            <ol className="mb-4 mt-2 list-decimal space-y-3 pl-5 last:mb-0">
                                                                {children}
                                                            </ol>
                                                        ),

                                                        li: ({ children }) => (
                                                            <li className="pl-1 leading-relaxed">
                                                                {children}
                                                            </li>
                                                        ),

                                                        strong: ({ children }) => (
                                                            <strong className="font-bold">
                                                                {children}
                                                            </strong>
                                                        ),

                                                        hr: () => (
                                                            <hr className="my-5 border-black/10" />
                                                        ),
                                                    }}
                                                >
                                                    {message.content}
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

                    <div className="border-t bg-white p-3">
                        {selectedImage && (
                            <div className="mb-2 flex items-center gap-3 rounded-2xl border border-black/10 bg-neutral-50 p-2">
                                <img
                                    src={selectedImage.dataUrl}
                                    alt={
                                        clientCourseConfig.text
                                            .imagePreview
                                    }
                                    className="h-14 w-14 rounded-xl object-cover"
                                />

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-neutral-800">
                                        {selectedImage.name}
                                    </p>
                                    <p className="text-[11px] text-neutral-500">
                                        {
                                            clientCourseConfig.text
                                                .imageReady
                                        }
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedImage(null);
                                        setImageError(null);
                                    }}
                                    aria-label={
                                        clientCourseConfig.text
                                            .removeImage
                                    }
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-black"
                                >
                                    <X size={16} strokeWidth={2.2} />
                                </button>
                            </div>
                        )}

                        {imageError && (
                            <p className="mb-2 px-1 text-xs text-red-600">
                                {imageError}
                            </p>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                            onChange={(event) =>
                                void handleImageSelection(event)
                            }
                            className="hidden"
                        />

                        <div className="flex items-center gap-2 rounded-3xl border border-black/10 bg-neutral-50 px-3 py-2 shadow-sm">
                            <button
                                type="button"
                                onClick={() =>
                                    fileInputRef.current?.click()
                                }
                                disabled={
                                    isLoading || isPreparingImage
                                }
                                aria-label={
                                    clientCourseConfig.text
                                        .attachImage
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ImagePlus
                                    size={19}
                                    strokeWidth={2.2}
                                />
                            </button>

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
                                    isPreparingImage
                                        ? clientCourseConfig.text
                                            .processingImage
                                        : clientCourseConfig.text
                                            .inputPlaceholder
                                }
                                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[16px] text-black placeholder:text-neutral-400 outline-none sm:text-sm"
                            />

                            <button
                                onClick={() =>
                                    void sendMessage()
                                }
                                disabled={
                                    isLoading ||
                                    isPreparingImage ||
                                    (
                                        input.trim().length === 0 &&
                                        !selectedImage
                                    )
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
                <div
                    className={`dsu-launcher-main ${
                        isMobileHost
                            ? "pointer-events-auto fixed bottom-4 right-4"
                            : ""
                    }`}
                >
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
                    className={`dsu-launcher-restore ${
                        isMobileHost ? "pointer-events-auto" : ""
                    }`}
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
