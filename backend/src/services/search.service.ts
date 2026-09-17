import dotenv from "dotenv";
import { Client } from "@elastic/elasticsearch";
import prisma from "../config/prisma";

dotenv.config();

const indexName = process.env.ELASTICSEARCH_INDEX || "reachinbox";
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

let available = true;

export async function ensureSearchIndex() {
  try {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            entity: { type: "keyword" },
            campaignId: { type: "keyword" },
            userId: { type: "keyword" },
            name: { type: "text" },
            subject: { type: "text" },
            body: { type: "text" },
            email: { type: "text" },
            recipientName: { type: "text" },
            status: { type: "keyword" },
          },
        },
      });
    }
    available = true;
    console.log(`Elasticsearch ready at ${process.env.ELASTICSEARCH_URL || "http://localhost:9200"}`);
  } catch (error) {
    available = false;
    console.warn("Elasticsearch unavailable; search indexing is disabled until it recovers.");
  }
}

export async function indexCampaign(campaign: {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  status: string;
  recipients: Array<{ id: string; email: string; name: string | null; status: string }>;
}) {
  if (!available) return;

  try {
    await client.helpers.bulk({
      datasource: [
        {
          _id: `campaign:${campaign.id}`,
          entity: "campaign",
          campaignId: campaign.id,
          userId: campaign.userId,
          name: campaign.name,
          subject: campaign.subject,
          body: campaign.body,
          status: campaign.status,
        },
        ...campaign.recipients.map((recipient) => ({
          _id: `recipient:${recipient.id}`,
          entity: "recipient",
          campaignId: campaign.id,
          userId: campaign.userId,
          email: recipient.email,
          recipientName: recipient.name,
          status: recipient.status,
        })),
      ],
      onDocument(document) {
        return { index: { _index: indexName, _id: document._id } };
      },
    });
  } catch (error) {
    available = false;
    console.warn("Elasticsearch indexing failed; campaigns remain available in PostgreSQL.");
  }
}

export async function searchCampaignsAndRecipients(query: string, userId?: string) {
  if (!available) {
    throw new Error("Elasticsearch is unavailable");
  }

  const result = await client.search({
    index: indexName,
    query: {
      bool: {
        must: query.trim()
          ? [{ multi_match: { query, fields: ["name", "subject", "body", "email", "recipientName"] } }]
          : [{ match_all: {} }],
        ...(userId ? { filter: [{ term: { userId } }] } : {}),
      },
    },
    size: 50,
  });

  return result.hits.hits.map((hit) => {
    const source = (hit._source || {}) as Record<string, unknown>;
    return { id: hit._id, ...source };
  });
}

export async function refreshCampaignIndex(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { recipients: true },
  });
  if (campaign) {
    await indexCampaign(campaign);
  }
}
