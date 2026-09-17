import dotenv from "dotenv";
import { Queue } from "bullmq";
import IORedis from "ioredis";

dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue("email-queue", {
  connection,
  defaultJobOptions: {
    attempts: Number(process.env.EMAIL_JOB_ATTEMPTS) || 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: false,
    removeOnFail: false,
  },
});