export type PublicCourseLanguage = "de" | "en";

function getLanguage(
    value: string | undefined
): PublicCourseLanguage {
    return value === "en" ? "en" : "de";
}

const language = getLanguage(
    process.env.NEXT_PUBLIC_COURSE_LANGUAGE
);

const courseId =
    process.env.NEXT_PUBLIC_COURSE_ID?.trim() ||
    (language === "en" ? "dsu-en" : "dsu-de");

const courseName =
    process.env.NEXT_PUBLIC_COURSE_NAME?.trim() ||
    (language === "en"
        ? "Dropshipping University"
        : "Dropshipping University Platinum");

const assistantName =
    process.env.NEXT_PUBLIC_ASSISTANT_NAME?.trim() ||
    "DSU AI";

export const clientCourseConfig = {
    id: courseId,
    language,
    name: courseName,
    assistantName,

    storageKey: `${courseId}-chat-history`,

    text:
        language === "en"
            ? {
                subtitle: "Dropshipping University Assistant",

                initialMessage: `👋 Welcome to the **${courseName}**.

I’m **${assistantName}** and I can help you with questions about Shopify, product research, advertising, business setup, general tax topics and course content.

You can also attach screenshots, product images or PDFs for analysis.

Just ask me anything.`,

                sources: "Sources",
                module: "Module",
                inputPlaceholder: "Send a message...",

                resetChat: "Reset chat",
                expandChat: "Expand chat",
                shrinkChat: "Shrink chat",
                openChat: "Open chat",
                closeChat: "Close chat",
                sendMessage: "Send message",

                attachImage: "Attach file",
                removeImage: "Remove image",
                attachedImage: "Attached image",
                attachedImages: "Attached images",
                attachedPdfs: "Attached PDFs",
                attachedPdf: "Attached PDF",
                removePdf: "Remove PDF",
                pdfReady: "Ready",
                pdfUploading: "Uploading...",
                dropImages: "Drop files here",
                imagePreview: "Image preview",
                imageReady: "Ready to send",
                processingImage: "Preparing image...",
                defaultImageMessage:
                    "Please analyze this image.",
                defaultAttachmentMessage:
                    "Please analyze the attached file.",
                maxImagesError:
                    "You can attach a maximum of 6 images.",
                maxPdfsError:
                    "You can attach a maximum of 3 PDFs.",
                imageTypeError:
                    "Please upload a JPG, PNG, WebP, HEIC or HEIF image.",
                pdfTypeError:
                    "Please upload a valid PDF file.",
                imageSizeError:
                    "The image is too large. Please use a smaller image.",
                pdfSizeError:
                    "The PDF is too large. Please use a smaller PDF.",
                imageProcessingError:
                    "The image could not be processed. Please try another image.",
                pdfUploadError:
                    "The PDF could not be uploaded. Please try another PDF.",
                attachmentUploadingError:
                    "Please wait until the attachment upload is finished.",
                messageTooLongError:
                    "Your message is too long. Please keep it under 800 characters.",

                genericError:
                    "Sorry, something went wrong. Please try again shortly.",
                chatbotError:
                    "The chatbot is currently unavailable.",
                noResponse:
                    "No response was received from the chatbot.",
            }
            : {
                subtitle: "Dropshipping University Assistant",

                initialMessage: `👋 Willkommen bei der **${courseName}**.

Ich bin **${assistantName}** und helfe dir bei Fragen rund um Shopify, Produktrecherche, Werbung, Gewerbe, Steuern allgemein und Kursinhalte.

Du kannst mir auch Screenshots, Produktbilder oder PDFs zur Analyse senden.

Frag mich einfach los.`,

                sources: "Verwendete Quellen",
                module: "Modul",
                inputPlaceholder: "Nachricht senden...",

                resetChat: "Chat zurücksetzen",
                expandChat: "Chat vergrößern",
                shrinkChat: "Chat verkleinern",
                openChat: "Chat öffnen",
                closeChat: "Chat schließen",
                sendMessage: "Nachricht senden",

                attachImage: "Datei anhängen",
                removeImage: "Bild entfernen",
                attachedImage: "Angehängtes Bild",
                attachedImages: "Angehängte Bilder",
                attachedPdfs: "Angehängte PDFs",
                attachedPdf: "Angehängtes PDF",
                removePdf: "PDF entfernen",
                pdfReady: "Bereit",
                pdfUploading: "Wird hochgeladen...",
                dropImages: "Dateien hier ablegen",
                imagePreview: "Bildvorschau",
                imageReady: "Bereit zum Senden",
                processingImage: "Bild wird vorbereitet...",
                defaultImageMessage:
                    "Bitte analysiere dieses Bild.",
                defaultAttachmentMessage:
                    "Bitte analysiere die angehängte Datei.",
                maxImagesError:
                    "Du kannst maximal 6 Bilder anhängen.",
                maxPdfsError:
                    "Du kannst maximal 3 PDFs anhängen.",
                imageTypeError:
                    "Bitte lade ein JPG-, PNG-, WebP-, HEIC- oder HEIF-Bild hoch.",
                pdfTypeError:
                    "Bitte lade eine gültige PDF-Datei hoch.",
                imageSizeError:
                    "Das Bild ist zu groß. Bitte verwende ein kleineres Bild.",
                pdfSizeError:
                    "Das PDF ist zu groß. Bitte verwende ein kleineres PDF.",
                imageProcessingError:
                    "Das Bild konnte nicht verarbeitet werden. Bitte versuche ein anderes Bild.",
                pdfUploadError:
                    "Das PDF konnte nicht hochgeladen werden. Bitte versuche ein anderes PDF.",
                attachmentUploadingError:
                    "Bitte warte, bis der Upload abgeschlossen ist.",
                messageTooLongError:
                    "Deine Nachricht ist zu lang. Bitte bleibe unter 800 Zeichen.",

                genericError:
                    "Sorry, da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.",
                chatbotError:
                    "Der Chatbot ist gerade nicht erreichbar.",
                noResponse:
                    "Keine Antwort vom Chatbot erhalten.",
            },
} as const;
