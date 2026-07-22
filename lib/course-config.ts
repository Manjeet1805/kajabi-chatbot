export type CourseLanguage = "de" | "en";

function getCourseLanguage(value: string | undefined): CourseLanguage {
    return value === "en" ? "en" : "de";
}

function parseAllowedOrigins(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}

const language = getCourseLanguage(process.env.COURSE_LANGUAGE);

export const courseConfig = {
    id: process.env.COURSE_ID?.trim() || "dsu-de",
    language,
    name:
        process.env.COURSE_NAME?.trim() ||
        (language === "en"
            ? "Dropshipping University"
            : "Dropshipping University Platinum"),

    allowedOrigins: [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:30001",
        ...parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    ],

    messages:
        language === "en"
            ? {
                forbidden: "This request is not allowed.",
                invalidRequest: "Invalid request.",
                rateLimit:
                    "You have sent too many messages. Please wait a moment and try again.",
                unavailable:
                    "The chatbot is currently unavailable. Please try again shortly.",
                noSources:
                    "No relevant course information was found.",
            }
            : {
                forbidden: "Diese Anfrage ist nicht erlaubt.",
                invalidRequest: "Ungültige Anfrage.",
                rateLimit:
                    "Du hast gerade zu viele Nachrichten gesendet. Bitte warte kurz und versuche es gleich noch einmal.",
                unavailable:
                    "Der Chatbot ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
                noSources:
                    "Keine relevanten Kursinformationen gefunden.",
            },
} as const;