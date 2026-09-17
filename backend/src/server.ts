import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import prisma from "./config/prisma";
import { sendTestEmail } from "./services/email.service";
import nodemailer from "nodemailer";
import { emailQueue } from "./queues/email.queue";
import { upload } from "./middleware/upload";
import csv from "csv-parser";
import { Readable } from "stream";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import session from "express-session";
import passport from "./config/passport";
import { ensureSearchIndex, indexCampaign, searchCampaignsAndRecipients } from "./services/search.service";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(express.json());

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

const getUserId = (req: express.Request) => {
  const user = req.user as { id?: string } | undefined;
  return user?.id;
};

const getLocalUser = async (req: express.Request) => {
  const userId = getUserId(req);

  if (userId) {
    return prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  const email = process.env.LOCAL_USER_EMAIL || "local@reachinbox.test";
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Local User" },
  });
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/auth/me", (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? req.user : null,
  });
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  (_req, res) => res.redirect("/health")
);
app.get("/auth/failure", (_req, res) => {
  res.status(401).json({ message: "Google authentication failed" });
});
app.post("/auth/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((sessionError) => {
      if (sessionError) return next(sessionError);
      res.status(204).end();
    });
  });
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

app.get("/search", async (req, res) => {
  try {
    const userId = getUserId(req);
    const results = await searchCampaignsAndRecipients(String(req.query.q || ""), userId);
    res.json({ results });
  } catch (error) {
    console.warn("Search unavailable:", error instanceof Error ? error.message : error);
    res.status(503).json({ message: "Search is temporarily unavailable", results: [] });
  }
});

app.get("/campaigns", async (req, res, next) => {
  try {
    const user = await getLocalUser(req);
    const campaigns = await prisma.campaign.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { recipients: true } } },
    });
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

app.get("/campaigns/:id", async (req, res, next) => {
  try {
    const user = await getLocalUser(req);
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: { recipients: { orderBy: { createdAt: "asc" } } },
    });

    if (!campaign) {
      res.status(404).json({ message: "Campaign not found" });
      return;
    }

    const counts = await prisma.emailRecipient.groupBy({
      by: ["status"],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    });
    const statistics = {
      total: campaign.recipients.length,
      sent: counts.find((item) => item.status === "SENT")?._count._all || 0,
      pending: counts.find((item) => item.status === "PENDING")?._count._all || 0,
      processing: counts.find((item) => item.status === "PROCESSING")?._count._all || 0,
      failed: counts.find((item) => item.status === "FAILED")?._count._all || 0,
    };
    res.json({ campaign, statistics });
  } catch (error) {
    next(error);
  }
});

app.post("/upload-csv", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "A CSV file is required" });
      return;
    }

    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    const delaySeconds = Math.max(0, Number(req.body.delaySeconds) || 0);
    const hourlyLimit = Math.max(1, Number(req.body.hourlyLimit) || 100);
    if (!subject || !body) {
      res.status(400).json({ message: "Subject and body are required" });
      return;
    }

    const rows: Array<{ email?: string; name?: string }> = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from(req.file!.buffer)
        .pipe(csv())
        .on("data", (row: { email?: string; name?: string }) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    const recipients = rows
      .map((row) => ({
        email: String(row.email || "").trim(),
        name: row.name ? String(row.name).trim() : null,
      }))
      .filter((row) => row.email);
    if (recipients.length === 0) {
      res.status(400).json({ message: "CSV must contain an email column with at least one address" });
      return;
    }

    const user = await getLocalUser(req);
    const campaign = await prisma.campaign.create({
      data: {
        name: String(req.body.name || req.file.originalname.replace(/\.csv$/i, "")),
        subject,
        body,
        startTime: new Date(Date.now() + delaySeconds * 1000),
        delaySeconds,
        hourlyLimit,
        userId: user.id,
        recipients: { create: recipients },
      },
      include: { recipients: true },
    });

    await emailQueue.addBulk(
      campaign.recipients.map((recipient, index) => ({
        name: "send-email",
        data: {
          campaignId: campaign.id,
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          subject,
          body,
        },
        opts: {
          jobId: `email-${recipient.id}`,
          delay: delaySeconds * 1000 + index * delaySeconds * 1000,
        },
      }))
    );

    await indexCampaign(campaign);

    res.status(201).json({
      campaignId: campaign.id,
      totalRecipients: campaign.recipients.length,
      message: "Campaign scheduled successfully",
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Request failed:", error);
  res.status(500).json({ message: "Internal server error" });
});

void ensureSearchIndex();

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  server.close(() => process.exit(1));
});
