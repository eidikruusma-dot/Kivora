import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Root cause of a live production 400 on POST /api/ai/chat: express.json()'s
// default body-size limit is a mere 100kb (the body-parser/raw-body default).
// /api/ai/chat sends the freshly-built CURRENT_KIVORA_STATE context (Tasks +
// Plans + Goals + Notes + Habits + Calendar + School + Finance + Notifications,
// none of which are capped in size) as a single JSON field alongside the
// conversation history — a real, actively-used account's data trivially
// exceeds 100kb (School alone, for a handful of subjects with homework and
// exam entries, routinely does). Once exceeded, body-parser rejects the
// request itself — as a clean "too large" error, or as a JSON parse failure
// if an oversized body arrives truncated — in either case BEFORE
// validateChatRequest, auth, or the route handler ever runs. With no
// error-handling middleware previously registered, Express's default HTML
// error page meant the client never got a real `error` field to show the
// user. 2mb comfortably covers every module's realistic maximum size for an
// active account with room to grow; validateChatRequest additionally caps
// `context` itself at a smaller, specific limit so a still-oversized
// context fails with a clear, own error code instead of relying on the raw
// body limit.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use("/api", router);

// Global JSON error handler — must stay LAST and keep all four parameters
// (err, req, res, next) so Express recognizes it as error-handling
// middleware. Without this, a thrown error upstream of any route handler
// (body-parser's oversized/malformed-body rejection being the concrete
// case above, but also anything else Express itself rejects before a route
// runs) falls through to Express's built-in handler, which returns an HTML
// page — every client-side error path here (fetchAIReply's `body.error`
// extraction included) expects JSON, so that HTML page reads as "no useful
// error", which is exactly the gap this closes.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    (err as { status?: number; statusCode?: number } | null)?.status ??
    (err as { statusCode?: number } | null)?.statusCode ??
    500;
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  res.status(status).json({ error: message });
});

export default app;
