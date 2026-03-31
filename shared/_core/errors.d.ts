/**
 * Base HTTP error class with status code.
 * Throw this from route handlers to send specific HTTP errors.
 */
export declare class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string);
}
export declare const BadRequestError: (msg: string) => HttpError;
export declare const UnauthorizedError: (msg: string) => HttpError;
export declare const ForbiddenError: (msg: string) => HttpError;
export declare const NotFoundError: (msg: string) => HttpError;
//# sourceMappingURL=errors.d.ts.map