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

You can also attach a screenshot or product image for analysis.

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

                attachImage: "Attach image",
                removeImage: "Remove image",
                attachedImage: "Attached image",
                imagePreview: "Image preview",
                imageReady: "Ready to send",
                processingImage: "Preparing image...",
                defaultImageMessage:
                    "Please analyze this image.",
                imageTypeError:
                    "Please upload a JPG, PNG, WebP, HEIC or HEIF image.",
                imageSizeError:
                    "The image is too large. Please use a smaller image.",
                imageProcessingError:
                    "The image could not be processed. Please try another image.",

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

Du kannst mir auch einen Screenshot oder ein Produktbild zur Analyse senden.

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

                attachImage: "Bild anhängen",
                removeImage: "Bild entfernen",
                attachedImage: "Angehängtes Bild",
                imagePreview: "Bildvorschau",
                imageReady: "Bereit zum Senden",
                processingImage: "Bild wird vorbereitet...",
                defaultImageMessage:
                    "Bitte analysiere dieses Bild.",
                imageTypeError:
                    "Bitte lade ein JPG-, PNG-, WebP-, HEIC- oder HEIF-Bild hoch.",
                imageSizeError:
                    "Das Bild ist zu groß. Bitte verwende ein kleineres Bild.",
                imageProcessingError:
                    "Das Bild konnte nicht verarbeitet werden. Bitte versuche ein anderes Bild.",

                genericError:
                    "Sorry, da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.",
                chatbotError:
                    "Der Chatbot ist gerade nicht erreichbar.",
                noResponse:
                    "Keine Antwort vom Chatbot erhalten.",
            },
} as const;
