import { createHmac, timingSafeEqual } from "crypto";
import { courseConfig } from "@/lib/course-config";

function getPdfFileTokenSecret(): string {
    return (
        process.env.PDF_FILE_TOKEN_SECRET ||
        process.env.OPENAI_API_KEY ||
        ""
    );
}

function getPdfFileTokenPayload(
    fileId: string,
    name: string,
    size: number
): string {
    return `${courseConfig.id}:${fileId}:${name}:${size}`;
}

export function createPdfFileToken(
    fileId: string,
    name: string,
    size: number
): string {
    const secret = getPdfFileTokenSecret();

    return createHmac("sha256", secret)
        .update(getPdfFileTokenPayload(fileId, name, size))
        .digest("hex");
}

export function verifyPdfFileToken(
    fileId: string,
    name: string,
    size: number,
    token: string
): boolean {
    const expectedToken = createPdfFileToken(
        fileId,
        name,
        size
    );

    const expected = Buffer.from(expectedToken, "hex");
    const actual = Buffer.from(token, "hex");

    if (actual.length !== expected.length) {
        return false;
    }

    return timingSafeEqual(actual, expected);
}
