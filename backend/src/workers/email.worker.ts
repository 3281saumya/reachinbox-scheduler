
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { sendTestEmail } from "../services/email.service";
import prisma from "../config/prisma";
import { waitForRateLimit } from "../services/rate-limiter.service";
import { refreshCampaignIndex } from "../services/search.service";

dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const workerConcurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2);

async function updateCampaignStatus(campaignId: string) {
  const remaining = await prisma.emailRecipient.count({
    where: {
      campaignId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: remaining === 0 ? "COMPLETED" : "RUNNING" },
  });
  await refreshCampaignIndex(campaignId).catch(() => undefined);
}

async function recoverStuckRecipients() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const result = await prisma.emailRecipient.updateMany({
    where: { status: "PROCESSING", processingAt: { lt: cutoff } },
    data: { status: "PENDING", processingAt: null },
  });
  if (result.count > 0) {
    console.log(`Recovered ${result.count} stale email recipient(s)`);
  }
}

const worker = new Worker(
  "email-queue",
  async (job: Job) => {
    console.log("Processing email job:", job.id);

    const {
      campaignId,
      recipientEmail,
      subject,
      body,
      recipientId,
    } = job.data;

    if (!recipientId || !campaignId) {
      throw new Error("Recipient ID or campaign ID is missing");
    }

    await prisma.emailRecipient.updateMany({
      where: {
        id: recipientId,
        status: "PROCESSING",
        processingAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: { status: "PENDING", processingAt: null },
    });

    const claimedRecipient = await prisma.emailRecipient.updateMany({
      where: {
        id: recipientId,
        status: "PENDING",
      },
      data: {
        status: "PROCESSING",
        processingAt: new Date(),
      },
    });

    if (claimedRecipient.count === 0) {
      console.log(`Skipping job ${job.id}: already processed`);

      return {
        success: true,
        skipped: true,
      };
    }

    try {
      const campaign = await prisma.campaign.findUnique({
        where: {
          id: campaignId,
        },
        select: {
          hourlyLimit: true,
        },
      });

      if (!campaign) {
        throw new Error("Campaign not found");
      }

      await waitForRateLimit(
        campaignId,
        campaign.hourlyLimit
      );

      const info = await sendTestEmail(
        recipientEmail,
        subject,
        body
      );

      await prisma.emailRecipient.update({
        where: {
          id: recipientId,
        },
        data: {
          status: "SENT",
          sentAt: new Date(),
          processingAt: null,
        },
      });
      await updateCampaignStatus(campaignId);

      console.log(
        "Email successfully sent:",
        info.messageId
      );

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const attempts = Number(job.opts.attempts) || 1;
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      await prisma.emailRecipient.update({
        where: {
          id: recipientId,
        },
        data: {
          status: finalAttempt ? "FAILED" : "PENDING",
          processingAt: null,
        },
      });
      await updateCampaignStatus(campaignId);

      console.error("Email processing failed:", error);

      throw error;
    }
  },
  {
    connection,
    concurrency: workerConcurrency,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, error) => {
  console.error(
    `Job ${job?.id} failed:`,
    error.message
  );
});

void recoverStuckRecipients().catch((error) => {
  console.error("Could not recover stale recipients:", error);
});

console.log(`Email worker is running with concurrency ${workerConcurrency}...`);