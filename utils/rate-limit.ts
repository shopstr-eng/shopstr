import rateLimit from "express-rate-limit";
import { NextApiRequest, NextApiResponse } from "next";

const getIP = (req: NextApiRequest) =>
  req.headers["x-forwarded-for"] || req.socket.remoteAddress;

export const limiter = rateLimit({
  keyGenerator: getIP as any,
  windowMs: 15 * 60 * 1000, 
  max: 50, 
  message: { error: "Too many requests, please try again later." },
});

export function applyRateLimit(req: NextApiRequest, res: NextApiResponse) {
  return new Promise((resolve, reject) => {
    limiter(req as any, res as any, (result: any) => {
      if (result instanceof Error) reject(result);
      resolve(result);
    });
  });
}