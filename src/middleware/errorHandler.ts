import type { NextFunction, Request, Response } from "express";

type AppError = Error & {
  status?: number;
  code?: string;
};

export function notFoundHandler(req: Request, res: Response) {
  return res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status =
    Number.isInteger(err.status) && err.status! >= 400 && err.status! < 600
      ? err.status!
      : 500;

  if (status >= 500) {
    console.error("Unhandled server error:", err);
  }

  const response: {
    error: string;
    code?: string;
    details?: string;
  } = {
    error: status >= 500 ? "Internal server error" : err.message || "Request failed",
  };

  if (err.code) {
    response.code = err.code;
  }

  if (process.env.NODE_ENV !== "production" && status >= 500 && err.stack) {
    response.details = err.stack;
  }

  return res.status(status).json(response);
}
