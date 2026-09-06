"use client";

import {
    type ChangeEvent,
    type DragEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    ArrowUp,
    BookOpen,
    ChevronLeft,
    Expand,
    FileText,
    Loader2,
    Paperclip,
    RotateCcw,
    Shrink,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clientCourseConfig } from "@/lib/client-course-config";
import { heicTo } from "heic-to";
import {
    isPdfFileName,
    MAX_PDF_FILE_SIZE,
    MAX_PDFS,
} from "@/lib/pdf-attachments";

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
    imageUrls?: string[];
    imageUrl?: string;
    pdfs?: MessagePdf[];
};

type SelectedImage = {
    dataUrl: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    name: string;
};

type MessagePdf = {
    name: string;
    size: number;
};

type SelectedPdf = MessagePdf & {
    id: string;
    status: "uploading" | "ready" | "error";
    fileId?: string;
    token?: string;
};

type UploadedPdfResponse = {
    fileId: string;
    name: string;
    size: number;
    token: string;
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
const MAX_CHAT_MESSAGE_LENGTH = 800;
const MAX_IMAGES = 6;
const MAX_IMAGE_FILE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 5_000_000;
const MAX_TOTAL_IMAGE_DATA_URL_LENGTH = 16_000_000;
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
        .map((message) => ({
            role: message.role,
            content: message.content,
            sources: message.sources,
        }))
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

function getImageErrorMessage(error: unknown): string {
    const code =
        error instanceof Error ? error.message : "";

    if (code === "IMAGE_TYPE_NOT_ALLOWED") {
        return clientCourseConfig.text.imageTypeError;
    }

    if (
        code === "IMAGE_TOO_LARGE" ||
        code === "IMAGE_TOO_LARGE_AFTER_PROCESSING" ||
        code === "IMAGES_TOTAL_TOO_LARGE"
    ) {
        return clientCourseConfig.text.imageSizeError;
    }

    return clientCourseConfig.text.imageProcessingError;
}

function isPdfFile(file: File): boolean {
    return (
        (file.type === "application/pdf" ||
            file.type === "application/x-pdf") &&
        isPdfFileName(file.name)
    );
}

function isImageFile(file: File): boolean {
    const extension = getFileExtension(file.name);

    return (
        file.type.startsWith("image/") ||
        [
            "jpg",
            "jpeg",
            "png",
            "webp",
            "heic",
            "heif",
        ].includes(extension)
    );
}

function formatFileSize(size: number): string {
    if (size < 1024 * 1024) {
        return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getPdfErrorMessage(error: unknown): string {
    const code =
        error instanceof Error ? error.message : "";

    if (code === "PDF_TYPE_NOT_ALLOWED") {
        return clientCourseConfig.text.pdfTypeError;
    }

    if (code === "PDF_TOO_LARGE") {
        return clientCourseConfig.text.pdfSizeError;
    }

    if (code === "MAX_PDFS_EXCEEDED") {
        return clientCourseConfig.text.maxPdfsError;
    }

    return clientCourseConfig.text.pdfUploadError;
}

async function uploadPdf(file: File): Promise<UploadedPdfResponse> {
    if (!isPdfFile(file)) {
        throw new Error("PDF_TYPE_NOT_ALLOWED");
    }

    if (file.size > MAX_PDF_FILE_SIZE) {
        throw new Error("PDF_TOO_LARGE");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/files/pdf", {
        method: "POST",
        body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.error || "PDF_UPLOAD_FAILED");
    }

    return data as UploadedPdfResponse;
}

function deleteUploadedPdf(pdf: SelectedPdf) {
    if (!pdf.fileId || !pdf.token) {
        return;
    }

    void fetch("/api/files/pdf", {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            fileId: pdf.fileId,
            name: pdf.name,
            size: pdf.size,
            token: pdf.token,
        }),
    }).catch(() => undefined);
}

function isReadyPdf(
    pdf: SelectedPdf
): pdf is SelectedPdf & { fileId: string; token: string } {
    return (
        pdf.status === "ready" &&
        typeof pdf.fileId === "string" &&
        typeof pdf.token === "string"
    );
}

function isFileDrag(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes(
        "Files"
    );
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
    const [selectedImages, setSelectedImages] =
        useState<SelectedImage[]>([]);
    const [selectedPdfs, setSelectedPdfs] =
        useState<SelectedPdf[]>([]);
    const [imageError, setImageError] =
        useState<string | null>(null);
    const [isDraggingImages, setIsDraggingImages] =
        useState(false);
    const [isPreparingImage, setIsPreparingImage] =
        useState(false);
    const [isUploadingPdf, setIsUploadingPdf] =
        useState(false);
    const [isLoading, setIsLoading] =
        useState(false);

    const [isStorageReady, setIsStorageReady] =
        useState(false);

    const messagesEndRef =
        useRef<HTMLDivElement | null>(null);
    const fileInputRef =
        useRef<HTMLInputElement | null>(null);
    const selectedImagesRef = useRef<SelectedImage[]>([]);
    const selectedPdfsRef = useRef<SelectedPdf[]>([]);
    const dragDepthRef = useRef(0);

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
        selectedImagesRef.current = [];
        selectedPdfsRef.current.forEach(deleteUploadedPdf);
        selectedPdfsRef.current = [];
        setSelectedImages([]);
        setSelectedPdfs([]);
        setImageError(null);
        setIsDraggingImages(false);
        dragDepthRef.current = 0;

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
        if (
            source.moduleNumber != null &&
            source.moduleNumber > 0 &&
            source.module
        ) {
            return {
                hasModule: true,

                moduleLabel:
                    `${clientCourseConfig.text.module} ` +
                    `${source.moduleNumber} · ${source.module}`,

                detailLabel:
                    source.lesson || source.title,
            };
        }

        if (
            source.moduleNumber != null &&
            source.moduleNumber > 0
        ) {
            return {
                hasModule: true,

                moduleLabel:
                    `${clientCourseConfig.text.module} ` +
                    `${source.moduleNumber}`,

                detailLabel:
                    source.lesson || source.title,
            };
        }

        if (source.module) {
            return {
                hasModule: true,
                moduleLabel: source.module,
                detailLabel:
                    source.lesson || source.title,
            };
        }

        return {
            hasModule: false,
            moduleLabel: source.title,
        };
    }

    async function addImageFiles(files: File[]) {
        if (
            isLoading ||
            isPreparingImage ||
            isUploadingPdf ||
            files.length === 0
        ) {
            return;
        }

        const remainingSlots =
            MAX_IMAGES - selectedImagesRef.current.length;

        if (remainingSlots <= 0) {
            setImageError(clientCourseConfig.text.maxImagesError);
            return;
        }

        const filesToProcess = files.slice(0, remainingSlots);
        const hasTooManyFiles =
            files.length > remainingSlots;

        setImageError(null);
        setIsPreparingImage(true);

        try {
            const results = await Promise.allSettled(
                filesToProcess.map((file) => prepareImage(file))
            );

            const successfulImages = results.flatMap((result) =>
                result.status === "fulfilled"
                    ? [result.value]
                    : []
            );

            const failedResult = results.find(
                (result) => result.status === "rejected"
            );

            let totalTooLarge = false;
            const imagesToAdd: SelectedImage[] = [];
            const currentImages = selectedImagesRef.current;
            const availableSlots =
                MAX_IMAGES - currentImages.length;

            if (
                successfulImages.length > 0 &&
                availableSlots > 0
            ) {
                let totalLength = currentImages.reduce(
                    (sum, image) => sum + image.dataUrl.length,
                    0
                );

                for (const image of successfulImages.slice(
                    0,
                    availableSlots
                )) {
                    const nextTotalLength =
                        totalLength + image.dataUrl.length;

                    if (
                        nextTotalLength >
                        MAX_TOTAL_IMAGE_DATA_URL_LENGTH
                    ) {
                        totalTooLarge = true;
                        continue;
                    }

                    imagesToAdd.push(image);
                    totalLength = nextTotalLength;
                }

                if (imagesToAdd.length > 0) {
                    const nextImages = [
                        ...currentImages,
                        ...imagesToAdd,
                    ];

                    selectedImagesRef.current = nextImages;
                    setSelectedImages(nextImages);
                }
            }

            if (failedResult?.status === "rejected") {
                setImageError(
                    getImageErrorMessage(failedResult.reason)
                );
            } else if (totalTooLarge) {
                setImageError(
                    clientCourseConfig.text.imageSizeError
                );
            } else if (
                hasTooManyFiles ||
                imagesToAdd.length < successfulImages.length
            ) {
                setImageError(
                    clientCourseConfig.text.maxImagesError
                );
            }
        } finally {
            setIsPreparingImage(false);
        }
    }

    async function addPdfFiles(files: File[]) {
        if (
            isLoading ||
            isPreparingImage ||
            isUploadingPdf ||
            files.length === 0
        ) {
            return;
        }

        const remainingSlots =
            MAX_PDFS - selectedPdfsRef.current.length;

        if (remainingSlots <= 0) {
            setImageError(clientCourseConfig.text.maxPdfsError);
            return;
        }

        const filesToUpload = files.slice(0, remainingSlots);
        const hasTooManyFiles = files.length > remainingSlots;

        setImageError(null);
        setIsUploadingPdf(true);

        const uploadingPdfs: SelectedPdf[] = filesToUpload.map(
            (file) => ({
                id:
                    globalThis.crypto?.randomUUID?.() ??
                    `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
                name: file.name,
                size: file.size,
                status: "uploading",
            })
        );

        selectedPdfsRef.current = [
            ...selectedPdfsRef.current,
            ...uploadingPdfs,
        ];
        setSelectedPdfs(selectedPdfsRef.current);

        try {
            const results = await Promise.allSettled(
                filesToUpload.map((file) => uploadPdf(file))
            );

            let firstError: unknown = null;
            const currentPdfIds = new Set(
                selectedPdfsRef.current.map((pdf) => pdf.id)
            );

            results.forEach((result, index) => {
                if (
                    result.status === "fulfilled" &&
                    !currentPdfIds.has(uploadingPdfs[index].id)
                ) {
                    deleteUploadedPdf({
                        id: uploadingPdfs[index].id,
                        name: result.value.name,
                        size: result.value.size,
                        status: "ready",
                        fileId: result.value.fileId,
                        token: result.value.token,
                    });
                }
            });

            const nextPdfs = selectedPdfsRef.current.map((pdf) => {
                const uploadIndex = uploadingPdfs.findIndex(
                    (uploadingPdf) => uploadingPdf.id === pdf.id
                );

                if (uploadIndex === -1) {
                    return pdf;
                }

                const result = results[uploadIndex];

                if (result.status === "fulfilled") {
                    return {
                        ...pdf,
                        name: result.value.name,
                        size: result.value.size,
                        status: "ready" as const,
                        fileId: result.value.fileId,
                        token: result.value.token,
                    };
                }

                firstError ??= result.reason;

                return {
                    ...pdf,
                    status: "error" as const,
                };
            });

            selectedPdfsRef.current = nextPdfs;
            setSelectedPdfs(nextPdfs);

            if (firstError) {
                setImageError(getPdfErrorMessage(firstError));
            } else if (hasTooManyFiles) {
                setImageError(clientCourseConfig.text.maxPdfsError);
            }
        } finally {
            setIsUploadingPdf(false);
        }
    }

    async function addAttachmentFiles(files: File[]) {
        const imageFiles = files.filter(
            (file) => isImageFile(file) && !isPdfFile(file)
        );
        const pdfFiles = files.filter(isPdfFile);
        const unsupportedFiles = files.filter(
            (file) => !isImageFile(file) && !isPdfFile(file)
        );

        if (unsupportedFiles.length > 0) {
            setImageError(clientCourseConfig.text.pdfTypeError);
        }

        if (imageFiles.length > 0) {
            await addImageFiles(imageFiles);
        }

        if (pdfFiles.length > 0) {
            await addPdfFiles(pdfFiles);
        }
    }

    async function handleAttachmentSelection(
        event: ChangeEvent<HTMLInputElement>
    ) {
        const files = Array.from(event.target.files ?? []);

        event.target.value = "";

        await addAttachmentFiles(files);
    }

    function removeSelectedImage(indexToRemove: number) {
        const nextImages = selectedImagesRef.current.filter(
            (_image, index) => index !== indexToRemove
        );

        selectedImagesRef.current = nextImages;
        setSelectedImages(nextImages);
        setImageError(null);
    }

    function removeSelectedPdf(indexToRemove: number) {
        const pdfToRemove = selectedPdfsRef.current[indexToRemove];

        if (pdfToRemove) {
            deleteUploadedPdf(pdfToRemove);
        }

        const nextPdfs = selectedPdfsRef.current.filter(
            (_pdf, index) => index !== indexToRemove
        );

        selectedPdfsRef.current = nextPdfs;
        setSelectedPdfs(nextPdfs);
        setImageError(null);
    }

    function handleComposerDragEnter(
        event: DragEvent<HTMLDivElement>
    ) {
        if (!isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingImages(true);
    }

    function handleComposerDragOver(
        event: DragEvent<HTMLDivElement>
    ) {
        if (!isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDraggingImages(true);
    }

    function handleComposerDragLeave(
        event: DragEvent<HTMLDivElement>
    ) {
        if (!isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current = Math.max(
            0,
            dragDepthRef.current - 1
        );

        if (dragDepthRef.current === 0) {
            setIsDraggingImages(false);
        }
    }

    function handleComposerDrop(
        event: DragEvent<HTMLDivElement>
    ) {
        if (!isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingImages(false);

        const files = Array.from(event.dataTransfer.files);
        void addAttachmentFiles(files);
    }

    async function sendMessage() {
        const text = input.trim();
        const imagesToSend = selectedImagesRef.current;
        const pdfsToSend = selectedPdfsRef.current.filter(isReadyPdf);
        const hasIncompletePdfs = selectedPdfsRef.current.some(
            (pdf) => !isReadyPdf(pdf)
        );

        if (
            (
                !text &&
                imagesToSend.length === 0 &&
                pdfsToSend.length === 0
            ) ||
            isLoading ||
            isPreparingImage ||
            isUploadingPdf
        ) {
            return;
        }

        if (hasIncompletePdfs) {
            setImageError(
                clientCourseConfig.text.attachmentUploadingError
            );
            return;
        }

        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            setMessages((previousMessages) => [
                ...previousMessages,
                {
                    role: "user",
                    content: text,
                },
                {
                    role: "assistant",
                    content:
                        clientCourseConfig.text
                            .messageTooLongError,
                },
            ]);

            return;
        }

        const totalImageDataUrlLength = imagesToSend.reduce(
            (sum, image) => sum + image.dataUrl.length,
            0
        );

        if (
            totalImageDataUrlLength >
            MAX_TOTAL_IMAGE_DATA_URL_LENGTH
        ) {
            setImageError(clientCourseConfig.text.imageSizeError);
            return;
        }

        const displayText = text
            ? text
            : pdfsToSend.length > 0
                ? clientCourseConfig.text.defaultAttachmentMessage
                : clientCourseConfig.text.defaultImageMessage;

        const assistantMessageIndex =
            messages.length + 1;

        setMessages((previousMessages) => [
            ...previousMessages,
            {
                role: "user",
                content: displayText,
                imageUrls: imagesToSend.map(
                    (image) => image.dataUrl
                ),
                pdfs: pdfsToSend.map((pdf) => ({
                    name: pdf.name,
                    size: pdf.size,
                })),
            },
            {
                role: "assistant",
                content: "",
                sources: [],
            },
        ]);

        setInput("");
        selectedImagesRef.current = [];
        selectedPdfsRef.current = [];
        setSelectedImages([]);
        setSelectedPdfs([]);
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
                    images: imagesToSend.length
                        ? imagesToSend.map((image) => ({
                            dataUrl: image.dataUrl,
                            mimeType: image.mimeType,
                        }))
                        : undefined,
                    pdfs: pdfsToSend.length
                        ? pdfsToSend.map((pdf) => ({
                            fileId: pdf.fileId,
                            name: pdf.name,
                            size: pdf.size,
                            token: pdf.token,
                        }))
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
                    className={`relative flex flex-col overflow-hidden bg-white ${
                        isMobileHost
                            ? "pointer-events-auto fixed inset-0 z-50 h-[100dvh] w-screen max-w-none rounded-none border-0 shadow-none"
                            : `absolute bottom-[90px] right-0 h-[520px] max-w-[calc(100vw-32px)] rounded-3xl border border-black/10 shadow-2xl transition-[width] duration-200 ${
                                isExpanded
                                    ? "w-[550px]"
                                    : "w-[360px]"
                            }`
                    }`}
                    onDragEnter={handleComposerDragEnter}
                    onDragOver={handleComposerDragOver}
                    onDragLeave={handleComposerDragLeave}
                    onDrop={handleComposerDrop}
                >
                    {isDraggingImages && (
                        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border border-dashed border-black/20 bg-white/80 text-xs font-medium text-neutral-700">
                            {clientCourseConfig.text.dropImages}
                        </div>
                    )}

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
                                const messageImageUrls =
                                    message.imageUrls ??
                                    (message.imageUrl
                                        ? [message.imageUrl]
                                        : []);
                                const messagePdfs =
                                    message.pdfs ?? [];

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
                                        {messageImageUrls.length > 0 && (
                                            <div
                                                className={`mb-3 grid gap-2 ${
                                                    messageImageUrls.length ===
                                                    1
                                                        ? "grid-cols-1"
                                                        : "grid-cols-2"
                                                }`}
                                            >
                                                {messageImageUrls.map(
                                                    (
                                                        imageUrl,
                                                        imageIndex
                                                    ) => (
                                                        <img
                                                            key={imageIndex}
                                                            src={imageUrl}
                                                            alt={
                                                                clientCourseConfig
                                                                    .text
                                                                    .attachedImage
                                                            }
                                                            className={
                                                                messageImageUrls.length ===
                                                                1
                                                                    ? "max-h-48 w-full rounded-xl object-contain"
                                                                    : "h-24 w-full rounded-xl object-cover"
                                                            }
                                                        />
                                                    )
                                                )}
                                            </div>
                                        )}

                                        {messagePdfs.length > 0 && (
                                            <div className="mb-3 space-y-2">
                                                {messagePdfs.map(
                                                    (pdf, pdfIndex) => (
                                                        <div
                                                            key={`${pdf.name}-${pdfIndex}`}
                                                            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left"
                                                            title={pdf.name}
                                                        >
                                                            <FileText
                                                                size={16}
                                                                strokeWidth={
                                                                    2.2
                                                                }
                                                                className="shrink-0 text-white/80"
                                                            />

                                                            <div className="min-w-0">
                                                                <p className="truncate text-xs font-medium text-white">
                                                                    {
                                                                        pdf.name
                                                                    }
                                                                </p>
                                                                <p className="text-[11px] text-white/60">
                                                                    {formatFileSize(
                                                                        pdf.size
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )
                                                )}
                                            </div>
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

                    <div
                        className={`relative border-t bg-white p-3 transition ${
                            isDraggingImages
                                ? "bg-neutral-50"
                                : ""
                        }`}
                    >
                        {(selectedImages.length > 0 ||
                            selectedPdfs.length > 0) && (
                            <div className="mb-2 rounded-2xl border border-black/10 bg-neutral-50 p-2">
                                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                    <p className="text-[11px] font-medium text-neutral-600">
                                        {selectedPdfs.length > 0
                                            ? clientCourseConfig.text
                                                .attachedPdfs
                                            : clientCourseConfig.text
                                                .attachedImages}
                                    </p>
                                    <p className="text-[11px] text-neutral-500">
                                        {selectedImages.length} / {MAX_IMAGES}
                                        {selectedPdfs.length > 0
                                            ? ` · ${selectedPdfs.length} / ${MAX_PDFS}`
                                            : ""}
                                    </p>
                                </div>

                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {selectedImages.map(
                                        (image, index) => (
                                            <div
                                                key={`${image.name}-${index}`}
                                                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white"
                                                title={image.name}
                                            >
                                                <img
                                                    src={image.dataUrl}
                                                    alt={
                                                        clientCourseConfig
                                                            .text
                                                            .imagePreview
                                                    }
                                                    className="h-full w-full object-cover"
                                                />

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeSelectedImage(
                                                            index
                                                        )
                                                    }
                                                    aria-label={`${clientCourseConfig.text.removeImage} ${index + 1}`}
                                                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                                                >
                                                    <X
                                                        size={12}
                                                        strokeWidth={
                                                            2.4
                                                        }
                                                    />
                                                </button>
                                            </div>
                                        )
                                    )}

                                    {selectedPdfs.map(
                                        (pdf, index) => (
                                            <div
                                                key={pdf.id}
                                                className="relative flex h-14 w-40 shrink-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-2"
                                                title={pdf.name}
                                            >
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                                                    {pdf.status ===
                                                    "uploading" ? (
                                                        <Loader2
                                                            size={16}
                                                            strokeWidth={
                                                                2.2
                                                            }
                                                            className="animate-spin"
                                                        />
                                                    ) : (
                                                        <FileText
                                                            size={17}
                                                            strokeWidth={
                                                                2.2
                                                            }
                                                        />
                                                    )}
                                                </div>

                                                <div className="min-w-0 pr-5">
                                                    <p className="truncate text-[11px] font-medium text-neutral-800">
                                                        {pdf.name}
                                                    </p>
                                                    <p className="truncate text-[10px] text-neutral-500">
                                                        {pdf.status ===
                                                        "uploading"
                                                            ? clientCourseConfig
                                                                .text
                                                                .pdfUploading
                                                            : pdf.status ===
                                                                "error"
                                                              ? clientCourseConfig
                                                                  .text
                                                                  .pdfUploadError
                                                              : `${clientCourseConfig.text.pdfReady} · ${formatFileSize(pdf.size)}`}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeSelectedPdf(
                                                            index
                                                        )
                                                    }
                                                    aria-label={`${clientCourseConfig.text.removePdf} ${index + 1}`}
                                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                                                >
                                                    <X
                                                        size={12}
                                                        strokeWidth={
                                                            2.4
                                                        }
                                                    />
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
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
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf"
                            multiple
                            onChange={(event) =>
                                void handleAttachmentSelection(event)
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
                                    isLoading ||
                                    isPreparingImage ||
                                    isUploadingPdf
                                }
                                aria-label={
                                    clientCourseConfig.text
                                        .attachImage
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Paperclip
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
                                        : isUploadingPdf
                                          ? clientCourseConfig.text
                                              .pdfUploading
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
                                    isUploadingPdf ||
                                    selectedPdfs.some(
                                        (pdf) => !isReadyPdf(pdf)
                                    ) ||
                                    (
                                        input.trim().length === 0 &&
                                        selectedImages.length === 0 &&
                                        selectedPdfs.every(
                                            (pdf) =>
                                                pdf.status !==
                                                "ready"
                                        )
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
