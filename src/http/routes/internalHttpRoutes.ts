import { Router } from "express";
import { param } from "express-validator";

export const internalHttpRouter = Router();

internalHttpRouter.post("/container/:containerId", param("containerId").isString(), async (req, res) => {
    
});