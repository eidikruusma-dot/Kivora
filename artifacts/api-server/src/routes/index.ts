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
//
// requireFirebaseAuth is mounted with the explicit "/ai" path so it only
// runs for requests under /api/ai — Router#use(middlewareFn) with NO path
// (the previous form) applies to every request that reaches this router,
// which silently 401'd /api/contact, /api/support, /api/feedback, and
// /api/push too, since aiBoundary is mounted ahead of them below. Express
// restores req.url after this path-scoped layer, so aiRouter/aiUploadRouter
// still see the full "/ai/..." paths unchanged — no route URL moved.
const aiBoundary: IRouter = Router();
aiBoundary.use("/ai", requireFirebaseAuth);
aiBoundary.use(aiRouter);
aiBoundary.use(aiUploadRouter);
router.use(aiBoundary);

// Non-AI routes stay exactly as before — no authentication requirement added.
router.use(contactRouter);
router.use(supportRouter);
router.use(feedbackRouter);
router.use(pushRouter);

export default router;
