import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import aiUploadRouter from "./aiUpload";
import contactRouter from "./contact";
import supportRouter from "./support";
import feedbackRouter from "./feedback";
import pushRouter from "./push";
import { requireFirebaseAuth } from "../middleware/requireFirebaseAuth.js";

const router: IRouter = Router();

router.use(healthRouter);

// ── /api/ai boundary ────────────────────────────────────────────────────────
// Every route under /api/ai (chat, upload, bank-import, bank-import/revalidate,
// upload-direct-test) calls OpenAI or processes an uploaded file, so all of
// them require a valid Firebase ID token. requireFirebaseAuth is mounted
// exactly once, here, ahead of both AI routers — including ahead of
// aiUploadRouter's multer (multipart/upload) parsing, since that parsing
// happens inside each individual route handler, which only runs after this
// middleware calls next(). No individual route inside ai.ts/aiUpload.ts
// duplicates this check.
const aiBoundary: IRouter = Router();
aiBoundary.use(requireFirebaseAuth);
aiBoundary.use(aiRouter);
aiBoundary.use(aiUploadRouter);
router.use(aiBoundary);

// Non-AI routes stay exactly as before — no authentication requirement added.
router.use(contactRouter);
router.use(supportRouter);
router.use(feedbackRouter);
router.use(pushRouter);

export default router;
