import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── PDF renderer startup check ─────────────────────────────────────────────
// PDF OCR uses the OpenAI Responses API (input_file) — no native binary needed.
// Verify the API key is present so failures are discovered at boot, not upload.
if (!process.env["OPENAI_API_KEY"]) {
  logger.error(
    "OPENAI_API_KEY is not set — PDF OCR fallback will fail on every upload. " +
    "Set the secret before deploying.",
  );
} else {
  logger.info(
    "PDF renderer: OpenAI Responses API (input_file / base64). " +
    "No native binaries required — production-safe.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
