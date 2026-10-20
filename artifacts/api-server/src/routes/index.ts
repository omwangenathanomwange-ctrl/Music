import { Router, type IRouter } from "express";
import downloadsRouter from "./downloads";
import healthRouter from "./health";
import musicRouter from "./music";

const router: IRouter = Router();

router.use(healthRouter);
router.use(downloadsRouter);
router.use(musicRouter);

export default router;
