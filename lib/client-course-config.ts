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

                genericError:
                    "Sorry, da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.",
                chatbotError:
                    "Der Chatbot ist gerade nicht erreichbar.",
                noResponse:
                    "Keine Antwort vom Chatbot erhalten.",
            },
} as const;