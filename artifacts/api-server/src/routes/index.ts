import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import aiUploadRouter from "./aiUpload";
import contactRouter from "./contact";
import supportRouter from "./support";
import feedbackRouter from "./feedback";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(aiUploadRouter);
router.use(contactRouter);
router.use(supportRouter);
router.use(feedbackRouter);
router.use(pushRouter);

export default router;
