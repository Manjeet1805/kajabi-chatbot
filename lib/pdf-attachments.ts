export const MAX_PDFS = 3;
export const MAX_PDF_FILE_SIZE = 3 * 1024 * 1024;
export const MAX_PDF_UPLOAD_REQUEST_SIZE = 4 * 1024 * 1024;

export const PDF_FILE_ID_PATTERN = /^file-[A-Za-z0-9_-]+$/;

export function sanitizePdfFileName(fileName: string): string {
    const sanitized = fileName
        .replace(/[\\/]/g, "-")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    if (!sanitized) {
        return "document.pdf";
    }

    return sanitized.toLowerCase().endsWith(".pdf")
        ? sanitized
        : `${sanitized}.pdf`;
}

export function isPdfFileName(fileName: string): boolean {
    return fileName.trim().toLowerCase().endsWith(".pdf");
}
