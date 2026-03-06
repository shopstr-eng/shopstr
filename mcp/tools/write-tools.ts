import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpNostrSigner,
  McpRelayManager,
  signAndPublishEvent,
} from "@/utils/mcp/nostr-signing";
import { ApiKeyRecord, getAgentSigner } from "@/utils/mcp/auth";
import { EventTemplate } from "nostr-tools";
import { cacheEvent } from "@/utils/db/db-service";
import { v4 as uuidv4 } from "uuid";

function noSignerError() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "No signing key configured. Set your nsec via the /api/mcp/set-nsec endpoint or during onboarding to use write tools.",
        }),
      },
    ],
    isError: true,
  };
}

function permissionError() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "Insufficient permissions. This action requires a full_access API key.",
        }),
      },
    ],
    isError: true,
  };
}

function successResponse(data: any, startTime: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            ...data,
            _meta: {
              responseTimeMs: Date.now() - startTime,
              dataSource: "live",
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

function errorResponse(message: string, details: string, startTime: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: message,
          details,
          _meta: {
            responseTimeMs: Date.now() - startTime,
            dataSource: "live",
          },
        }),
      },
    ],
    isError: true,
  };
}

async function getSigner(apiKey: ApiKeyRecord): Promise<McpNostrSigner | null> {
  const result = await getAgentSigner(apiKey);
  if (!result) return null;
  return result.signer as McpNostrSigner;
}

export function registerWriteTools(
  server: McpServer,
  apiKey: ApiKeyRecord,
  token: string
) {
  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  server.tool(
    "set_user_profile",
    "Create or update your Nostr user profile (kind 0). Sets metadata like name, about, picture, lightning address, etc.",
    {
      name: z.string().optional().describe("Display name"),
      display_name: z.string().optional().describe("Full display name"),
      about: z.string().optional().describe("Bio/description"),
      picture: z.string().optional().describe("Profile picture URL"),
      banner: z.string().optional().describe("Banner image URL"),
      lud16: z
        .string()
        .optional()
        .describe("Lightning address (e.g. user@getalby.com)"),
      nip05: z
        .string()
        .optional()
        .describe("NIP-05 identifier (e.g. user@domain.com)"),
      website: z.string().optional().describe("Website URL"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const content: Record<string, string> = {};
        if (params.name) content.name = params.name;
        if (params.display_name) content.display_name = params.display_name;
        if (params.about) content.about = params.about;
        if (params.picture) content.picture = params.picture;
        if (params.banner) content.banner = params.banner;
        if (params.lud16) content.lud16 = params.lud16;
        if (params.nip05) content.nip05 = params.nip05;
        if (params.website) content.website = params.website;

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify(content),
          kind: 0,
          tags: [],
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            profile: content,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set user profile",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "set_shop_profile",
    "Create or update your shop profile (kind 30019). Sets shop metadata like name, about, picture, banner, and settings.",
    {
      name: z.string().optional().describe("Shop name"),
      about: z.string().optional().describe("Shop description"),
      picture: z.string().optional().describe("Shop logo URL"),
      banner: z.string().optional().describe("Shop banner image URL"),
      theme: z.string().optional().describe("Shop theme color"),
      darkMode: z.boolean().optional().describe("Enable dark mode for shop"),
      freeShippingThreshold: z
        .number()
        .optional()
        .describe("Minimum order amount for free shipping"),
      freeShippingCurrency: z
        .string()
        .optional()
        .describe("Currency for free shipping threshold"),
      merchants: z
        .array(z.string())
        .optional()
        .describe("Array of merchant pubkeys associated with this shop"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const content: Record<string, any> = {};
        if (params.name) content.name = params.name;
        if (params.about) content.about = params.about;
        if (params.merchants) content.merchants = params.merchants;
        const ui: Record<string, any> = {};
        if (params.picture) ui.picture = params.picture;
        if (params.banner) ui.banner = params.banner;
        if (params.theme) ui.theme = params.theme;
        if (params.darkMode !== undefined) ui.darkMode = params.darkMode;
        if (Object.keys(ui).length > 0) content.ui = ui;
        if (params.freeShippingThreshold)
          content.freeShippingThreshold = params.freeShippingThreshold;
        if (params.freeShippingCurrency)
          content.freeShippingCurrency = params.freeShippingCurrency;

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify(content),
          kind: 30019,
          tags: [["d", pubkey]],
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            shopProfile: content,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set shop profile",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "create_product_listing",
    "Publish a new product listing (kind 30402) to the marketplace. Creates a classified listing with title, description, price, images, categories, shipping options, and more.",
    {
      title: z.string().describe("Product title/name"),
      description: z.string().describe("Product description"),
      price: z.string().describe("Price amount as string"),
      currency: z.string().describe("Currency (e.g. 'USD', 'sats', 'BTC')"),
      images: z
        .array(z.string())
        .optional()
        .describe("Array of image URLs for the product"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Array of category tags"),
      location: z.string().optional().describe("Product location"),
      shippingOption: z
        .string()
        .optional()
        .describe(
          "Shipping type: 'N/A', 'Free', 'Added Cost', 'Pickup', 'Free/Pickup'"
        ),
      shippingCost: z
        .string()
        .optional()
        .describe("Shipping cost as string (default '0')"),
      quantity: z.string().optional().describe("Available quantity"),
      condition: z
        .string()
        .optional()
        .describe("Item condition (e.g. 'new', 'used')"),
      status: z
        .string()
        .optional()
        .describe("Listing status (e.g. 'active', 'draft')"),
      sizes: z
        .array(z.object({ size: z.string(), quantity: z.string() }))
        .optional()
        .describe("Size options with quantities"),
      volumes: z
        .array(z.object({ volume: z.string(), price: z.string() }))
        .optional()
        .describe("Volume/variant options with prices"),
      pickupLocations: z
        .array(z.string())
        .optional()
        .describe("Pickup location addresses"),
      expiration: z
        .string()
        .optional()
        .describe("Expiration date (ISO 8601 format)"),
      dTag: z
        .string()
        .optional()
        .describe(
          "Custom d-tag identifier. If omitted, one is generated from the title."
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const { createHash } = await import("crypto");
        const dTag =
          params.dTag ||
          createHash("sha256")
            .update(params.title + Date.now())
            .digest("hex")
            .substring(0, 16);

        const tags: string[][] = [
          ["d", dTag],
          ["alt", `Product listing: ${params.title}`],
          ["title", params.title],
          ["summary", params.description],
          ["price", params.price, params.currency],
          ["location", params.location || ""],
          [
            "shipping",
            params.shippingOption || "N/A",
            params.shippingCost || "0",
            params.currency,
          ],
        ];

        if (params.images) {
          for (const img of params.images) {
            tags.push(["image", img]);
          }
        }

        if (params.categories) {
          for (const cat of params.categories) {
            tags.push(["t", cat]);
          }
        }
        tags.push(["t", "shopstr"]);

        if (params.quantity) {
          tags.push(["quantity", params.quantity]);
        }

        if (params.sizes) {
          for (const s of params.sizes) {
            tags.push(["size", s.size, s.quantity]);
          }
        }

        if (params.volumes) {
          for (const v of params.volumes) {
            tags.push(["volume", v.volume, v.price]);
          }
        }

        if (params.condition) {
          tags.push(["condition", params.condition]);
        }

        if (params.status) {
          tags.push(["status", params.status]);
        }

        if (params.expiration) {
          const unixTime = Math.floor(
            new Date(params.expiration).getTime() / 1000
          );
          tags.push(["valid_until", unixTime.toString()]);
        }

        if (params.pickupLocations) {
          for (const loc of params.pickupLocations) {
            tags.push(["pickup_location", loc.trim()]);
          }
        }

        const created_at = Math.floor(Date.now() / 1000);
        tags.push(["published_at", String(created_at)]);

        const eventTemplate: EventTemplate = {
          created_at,
          kind: 30402,
          tags,
          content: params.description,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        const handlerDTag = uuidv4();
        const origin =
          process.env.NEXT_PUBLIC_BASE_URL || "https://shopstr.store";

        const handlerEvent: EventTemplate = {
          kind: 31990,
          tags: [
            ["d", handlerDTag],
            ["k", "30402"],
            ["web", `${origin}/marketplace/<bech-32>`, "npub"],
            ["web", `${origin}/listing/<bech-32>`, "naddr"],
          ],
          content: "",
          created_at: Math.floor(Date.now() / 1000),
        };

        const recEvent: EventTemplate = {
          kind: 31989,
          tags: [
            ["d", "30402"],
            ["a", `31990:${pubkey}:${handlerDTag}`, "", "web"],
          ],
          content: "",
          created_at: Math.floor(Date.now() / 1000),
        };

        await signAndPublishEvent(signer, recEvent).catch(console.error);
        await signAndPublishEvent(signer, handlerEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            dTag,
            listing: {
              title: params.title,
              price: params.price,
              currency: params.currency,
              categories: params.categories || [],
            },
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create product listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "update_product_listing",
    "Update an existing product listing by publishing a new event with the same d-tag. All fields are optional — only provided fields will be included.",
    {
      dTag: z.string().describe("The d-tag of the listing to update"),
      title: z.string().optional().describe("Updated product title"),
      description: z
        .string()
        .optional()
        .describe("Updated product description"),
      price: z.string().optional().describe("Updated price"),
      currency: z.string().optional().describe("Updated currency"),
      images: z.array(z.string()).optional().describe("Updated image URLs"),
      categories: z.array(z.string()).optional().describe("Updated categories"),
      location: z.string().optional().describe("Updated location"),
      shippingOption: z.string().optional().describe("Updated shipping type"),
      shippingCost: z.string().optional().describe("Updated shipping cost"),
      quantity: z.string().optional().describe("Updated quantity"),
      condition: z.string().optional().describe("Updated condition"),
      status: z.string().optional().describe("Updated status"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [["d", params.dTag]];

        if (params.title) {
          tags.push(["alt", `Product listing: ${params.title}`]);
          tags.push(["title", params.title]);
        }
        if (params.description) {
          tags.push(["summary", params.description]);
        }
        if (params.price && params.currency) {
          tags.push(["price", params.price, params.currency]);
        }
        if (params.location) {
          tags.push(["location", params.location]);
        }
        if (params.shippingOption) {
          tags.push([
            "shipping",
            params.shippingOption,
            params.shippingCost || "0",
            params.currency || "",
          ]);
        }
        if (params.images) {
          for (const img of params.images) {
            tags.push(["image", img]);
          }
        }
        if (params.categories) {
          for (const cat of params.categories) {
            tags.push(["t", cat]);
          }
          tags.push(["t", "shopstr"]);
        }
        if (params.quantity) {
          tags.push(["quantity", params.quantity]);
        }
        if (params.condition) {
          tags.push(["condition", params.condition]);
        }
        if (params.status) {
          tags.push(["status", params.status]);
        }

        const created_at = Math.floor(Date.now() / 1000);
        tags.push(["published_at", String(created_at)]);

        const eventTemplate: EventTemplate = {
          created_at,
          kind: 30402,
          tags,
          content: params.description || "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            dTag: params.dTag,
            updated: true,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to update product listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "delete_listing",
    "Delete a product listing or any Nostr event by publishing a deletion event (kind 5).",
    {
      eventIds: z.array(z.string()).describe("Array of event IDs to delete"),
      reason: z.string().optional().describe("Reason for deletion"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const eventTemplate: EventTemplate = {
          kind: 5,
          content: params.reason || "Deletion request",
          tags: params.eventIds.map((id) => ["e", id]),
          created_at: Math.floor(Date.now() / 1000),
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            deletedEventIds: params.eventIds,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to delete listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "publish_review",
    "Publish a review (kind 31555) for a product or seller. Includes content text and ratings.",
    {
      content: z.string().describe("Review text content"),
      productId: z
        .string()
        .optional()
        .describe("Product event ID being reviewed"),
      sellerPubkey: z
        .string()
        .optional()
        .describe("Seller pubkey being reviewed"),
      ratings: z
        .array(
          z.object({
            category: z
              .string()
              .describe(
                "Rating category (e.g. 'quality', 'communication', 'shipping')"
              ),
            value: z.number().describe("Rating value (typically 0-5)"),
          })
        )
        .optional()
        .describe("Array of rating categories and values"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        if (!params.productId && !params.sellerPubkey) {
          return errorResponse(
            "Missing target",
            "Either productId or sellerPubkey is required",
            startTime
          );
        }

        const pubkey = signer.getPubKey();
        const dTag = params.productId
          ? `${pubkey}:${params.productId}`
          : `${pubkey}:${params.sellerPubkey}`;

        const tags: string[][] = [["d", dTag]];

        if (params.productId) {
          tags.push(["e", params.productId]);
        }
        if (params.sellerPubkey) {
          tags.push(["p", params.sellerPubkey]);
        }

        if (params.ratings) {
          for (const r of params.ratings) {
            tags.push(["rating", r.value.toString(), r.category]);
          }
        }

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: params.content,
          kind: 31555,
          tags,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            review: {
              content: params.content,
              ratings: params.ratings,
              dTag,
            },
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to publish review",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "create_community_post",
    "Create a post in a Nostr community (kind 1111). Supports top-level posts and replies.",
    {
      content: z.string().describe("Post content text"),
      communityId: z
        .string()
        .describe(
          "Community address in format 'kind:pubkey:d-tag' (e.g. '34550:<pubkey>:<d-tag>')"
        ),
      communityPubkey: z.string().describe("Community creator's public key"),
      parentEventId: z
        .string()
        .optional()
        .describe("Parent event ID for replies"),
      parentPubkey: z
        .string()
        .optional()
        .describe("Parent event author pubkey (for replies)"),
      parentKind: z
        .number()
        .optional()
        .describe("Parent event kind (for replies)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [];

        tags.push(["A", params.communityId]);
        tags.push(["P", params.communityPubkey]);
        tags.push(["K", "34550"]);

        if (params.parentEventId) {
          tags.push(["a", params.communityId]);
          tags.push(["e", params.parentEventId, ""]);
          if (params.parentPubkey) tags.push(["p", params.parentPubkey, ""]);
          if (params.parentKind) tags.push(["k", String(params.parentKind)]);
        } else {
          tags.push(["a", params.communityId]);
          tags.push(["p", params.communityPubkey]);
          tags.push(["k", "34550"]);
        }

        const eventTemplate: EventTemplate = {
          kind: 1111,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: params.content,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            communityId: params.communityId,
            isReply: !!params.parentEventId,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create community post",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "send_direct_message",
    "Send an encrypted direct message using NIP-17 gift wrap (kind 1059/13/14). Supports plain messages, listing inquiries, and order-related messages.",
    {
      recipientPubkey: z.string().describe("Recipient's public key (hex)"),
      message: z.string().describe("Message content"),
      subject: z
        .string()
        .optional()
        .describe(
          "Message subject (e.g. 'listing-inquiry', 'order-payment', 'shipping-info', 'general')"
        ),
      productAddress: z
        .string()
        .optional()
        .describe(
          "Product address for listing inquiries (format: '30402:<pubkey>:<d-tag>')"
        ),
      orderId: z
        .string()
        .optional()
        .describe("Order ID for order-related messages"),
      isOrder: z
        .boolean()
        .optional()
        .describe("Whether this is an order-related message"),
      orderAmount: z
        .number()
        .optional()
        .describe("Order amount (for order messages)"),
      status: z
        .string()
        .optional()
        .describe("Order status (for order messages)"),
      tracking: z
        .string()
        .optional()
        .describe("Tracking number (for shipping updates)"),
      carrier: z
        .string()
        .optional()
        .describe("Shipping carrier (for shipping updates)"),
      address: z.string().optional().describe("Shipping address (for orders)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const {
          generateSecretKey,
          getPublicKey,
          finalizeEvent,
          getEventHash,
          nip44,
        } = await import("nostr-tools");
        const { bytesToHex } = await import("@noble/hashes/utils");

        const senderPubkey = signer.getPubKey();
        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const defaultRelays = getDefaultRelays();
        const relayHint = defaultRelays[0] || "wss://relay.damus.io";

        const innerTags: string[][] = [
          ["p", params.recipientPubkey, relayHint],
          ["subject", params.subject || "general"],
        ];

        if (params.isOrder) {
          innerTags.push(["order", params.orderId || uuidv4()]);
          if (params.orderAmount)
            innerTags.push(["amount", params.orderAmount.toString()]);
          if (params.status) innerTags.push(["status", params.status]);
          if (params.tracking) innerTags.push(["tracking", params.tracking]);
          if (params.carrier) innerTags.push(["carrier", params.carrier]);
          if (params.address) innerTags.push(["address", params.address]);
          if (params.productAddress) {
            innerTags.push(["item", params.productAddress, "1"]);
          }
        } else if (params.productAddress) {
          innerTags.push(["a", params.productAddress, relayHint]);
        }

        const innerEvent = {
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          content: params.message,
          kind: 14,
          tags: innerTags,
        };

        const innerEventForHash = {
          ...innerEvent,
          id: "",
          sig: "",
        };
        const innerEventId = getEventHash(innerEventForHash as any);
        const fullInnerEvent = { id: innerEventId, ...innerEvent };

        const randomPrivKey = generateSecretKey();
        const randomPubKey = getPublicKey(randomPrivKey);

        async function createGiftWrap(
          targetPubkey: string,
          sealPubkey: string,
          useRandomKey: boolean
        ) {
          const stringifiedInner = JSON.stringify(fullInnerEvent);
          let encryptedSealContent: string;

          if (useRandomKey) {
            const conversationKey = nip44.getConversationKey(
              randomPrivKey,
              targetPubkey
            );
            encryptedSealContent = nip44.encrypt(
              stringifiedInner,
              conversationKey
            );
          } else {
            encryptedSealContent = signer.encrypt(
              targetPubkey,
              stringifiedInner
            );
          }

          const now = Math.floor(Date.now() / 1000);
          const randomOffset = Math.floor(Math.random() * 172800);
          const sealTimestamp = now - randomOffset;

          const sealEvent = {
            pubkey: sealPubkey,
            created_at: sealTimestamp,
            content: encryptedSealContent,
            kind: 13,
            tags: [] as string[][],
          };

          let signedSeal;
          if (useRandomKey) {
            signedSeal = finalizeEvent(sealEvent, randomPrivKey);
          } else {
            signedSeal = signer.sign(sealEvent);
          }

          const wrapPrivKey = generateSecretKey();
          const wrapPubKey = getPublicKey(wrapPrivKey);

          const stringifiedSeal = JSON.stringify(signedSeal);
          const wrapConversationKey = nip44.getConversationKey(
            wrapPrivKey,
            targetPubkey
          );
          const encryptedWrap = nip44.encrypt(
            stringifiedSeal,
            wrapConversationKey
          );

          const wrapTimestamp = now - Math.floor(Math.random() * 172800);
          const giftWrapEvent = {
            pubkey: wrapPubKey,
            created_at: wrapTimestamp,
            content: encryptedWrap,
            kind: 1059,
            tags: [["p", targetPubkey, relayHint]],
          };

          return finalizeEvent(giftWrapEvent, wrapPrivKey);
        }

        const recipientWrap = await createGiftWrap(
          params.recipientPubkey,
          senderPubkey,
          false
        );
        const senderWrap = await createGiftWrap(
          senderPubkey,
          randomPubKey,
          true
        );

        const relayManager = new McpRelayManager(withBlastr(defaultRelays));

        try {
          await cacheEvent(recipientWrap as any);
          await cacheEvent(senderWrap as any);
          await relayManager.publish(recipientWrap as any);
          await relayManager.publish(senderWrap as any);
        } finally {
          relayManager.close();
        }

        return successResponse(
          {
            messageId: innerEventId,
            recipientPubkey: params.recipientPubkey,
            subject: params.subject || "general",
            isOrder: params.isOrder || false,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to send direct message",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "set_relay_list",
    "Publish your relay list (kind 10002, NIP-65). Configures which relays you read from and write to.",
    {
      relays: z
        .array(
          z.object({
            url: z.string().describe("Relay WebSocket URL (wss://...)"),
            type: z
              .enum(["read", "write", "both"])
              .optional()
              .describe("Relay type: 'read', 'write', or 'both' (default)"),
          })
        )
        .describe("Array of relay configurations"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [];
        for (const relay of params.relays) {
          if (relay.type === "read") {
            tags.push(["r", relay.url, "read"]);
          } else if (relay.type === "write") {
            tags.push(["r", relay.url, "write"]);
          } else {
            tags.push(["r", relay.url]);
          }
        }

        const eventTemplate: EventTemplate = {
          kind: 10002,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            relayCount: params.relays.length,
            relays: params.relays,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set relay list",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "set_blossom_servers",
    "Publish your Blossom media server list (kind 10063). Configures which servers to use for media uploads.",
    {
      servers: z.array(z.string()).describe("Array of Blossom server URLs"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = params.servers.map((s) => ["server", s]);

        const eventTemplate: EventTemplate = {
          kind: 10063,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            serverCount: params.servers.length,
            servers: params.servers,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set blossom servers",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "upload_media",
    "Upload media to a Blossom server. Creates a signed authorization event (kind 24242) and uploads the file. Returns the URL of the uploaded media.",
    {
      fileBase64: z.string().describe("Base64-encoded file content"),
      fileName: z.string().describe("File name with extension"),
      mimeType: z
        .string()
        .describe("MIME type of the file (e.g. 'image/jpeg', 'image/png')"),
      serverUrl: z
        .string()
        .optional()
        .describe(
          "Blossom server URL to upload to (default: https://cdn.nostrcheck.me)"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const fileBuffer = Buffer.from(params.fileBase64, "base64");
        const { createHash: cryptoCreateHash } = await import("crypto");
        const hash = cryptoCreateHash("sha256")
          .update(fileBuffer)
          .digest("hex");

        const authEvent: EventTemplate = {
          kind: 24242,
          content: `Upload ${params.fileName}`,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["t", "upload"],
            ["x", hash],
            ["size", fileBuffer.length.toString()],
            [
              "expiration",
              Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000).toString(),
            ],
          ],
        };

        const signedAuth = signer.sign(authEvent);
        const authBase64 = Buffer.from(JSON.stringify(signedAuth)).toString(
          "base64"
        );
        const authorization = `Nostr ${authBase64}`;

        const serverUrl = params.serverUrl || "https://cdn.nostrcheck.me";
        const uploadUrl = new URL("/upload", serverUrl);

        const response = await fetch(uploadUrl.toString(), {
          method: "PUT",
          body: fileBuffer,
          headers: {
            authorization,
            "content-type": params.mimeType,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          return errorResponse(
            "Upload failed",
            `Server responded with ${response.status}: ${errorText}`,
            startTime
          );
        }

        const result = await response.json();

        return successResponse(
          {
            url: result.url,
            sha256: result.sha256 || hash,
            size: result.size || fileBuffer.length,
            serverUrl,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to upload media",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "create_discount_code",
    "Create a discount code for your shop. Codes are percentage-based and can have optional expiration dates.",
    {
      code: z.string().describe("Discount code string (e.g. 'SUMMER20')"),
      discountPercentage: z.number().describe("Discount percentage (0-100)"),
      expiration: z
        .number()
        .optional()
        .describe("Expiration as Unix timestamp (optional)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(`${baseUrl}/api/db/discount-codes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: params.code,
            pubkey,
            discountPercentage: params.discountPercentage,
            expiration: params.expiration,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return errorResponse(
            "Failed to create discount code",
            data.error || "Unknown error",
            startTime
          );
        }
        return successResponse(
          {
            code: params.code,
            discountPercentage: params.discountPercentage,
            expiration: params.expiration,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create discount code",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "delete_discount_code",
    "Delete one of your discount codes.",
    {
      code: z.string().describe("Discount code to delete"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(`${baseUrl}/api/db/discount-codes`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: params.code, pubkey }),
        });
        const data = await res.json();
        if (!res.ok) {
          return errorResponse(
            "Failed to delete discount code",
            data.error || "Unknown error",
            startTime
          );
        }
        return successResponse({ code: params.code, deleted: true }, startTime);
      } catch (error) {
        return errorResponse(
          "Failed to delete discount code",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "list_discount_codes",
    "List your shop's discount codes.",
    {},
    async () => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(
          `${baseUrl}/api/db/discount-codes?pubkey=${pubkey}`
        );
        const data = await res.json();
        return successResponse(
          {
            count: Array.isArray(data) ? data.length : 0,
            codes: data,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to list discount codes",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "get_cashu_balance",
    "Check your Cashu wallet balance by querying stored proof events.",
    {
      mintUrl: z.string().optional().describe("Filter by specific mint URL"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { fetchCachedEvents } = await import("@/utils/db/db-service");
        const pubkey = signer.getPubKey();
        const proofEvents = await fetchCachedEvents(7375);
        const myProofEvents = proofEvents.filter(
          (e: any) => e.pubkey === pubkey
        );

        let totalBalance = 0;
        const mintBalances: Record<string, number> = {};

        for (const event of myProofEvents) {
          try {
            const decryptedContent = signer.decrypt(pubkey, event.content);
            const parsed = JSON.parse(decryptedContent);
            const mintUrl = parsed.mint;
            const proofs = parsed.proofs || [];
            const amount = proofs.reduce(
              (sum: number, p: any) => sum + (p.amount || 0),
              0
            );

            if (!params.mintUrl || mintUrl === params.mintUrl) {
              totalBalance += amount;
              mintBalances[mintUrl] = (mintBalances[mintUrl] || 0) + amount;
            }
          } catch {
            continue;
          }
        }

        return successResponse(
          {
            totalBalance,
            unit: "sats",
            mintBalances,
            proofEventCount: myProofEvents.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to get Cashu balance",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "receive_cashu_tokens",
    "Receive Cashu tokens and store them as a proof event (kind 7375). Publishes the encrypted proof event to your Nostr relays.",
    {
      token: z.string().describe("Serialized Cashu token string to receive"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { getDecodedToken } = await import("@cashu/cashu-ts");
        const decoded = getDecodedToken(params.token);
        const mintUrl = decoded.mint;
        const proofs = decoded.proofs;
        const totalAmount = proofs.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0
        );

        const pubkey = signer.getPubKey();

        const proofData = JSON.stringify({
          mint: mintUrl,
          proofs,
        });
        const encryptedContent = signer.encrypt(pubkey, proofData);

        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const relays = withBlastr(getDefaultRelays());
        const tags: string[][] = [["mint", mintUrl]];
        for (const relay of relays) {
          tags.push(["relay", relay]);
        }

        const eventTemplate: EventTemplate = {
          kind: 7375,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: encryptedContent,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            amount: totalAmount,
            mint: mintUrl,
            proofCount: proofs.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to receive Cashu tokens",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "set_cashu_mints",
    "Configure your Cashu wallet mints by publishing a wallet configuration event (kind 17375).",
    {
      mints: z
        .array(z.string())
        .describe(
          "Array of Cashu mint URLs (e.g. ['https://mint.minibits.cash/Bitcoin'])"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const mintTags = params.mints.map((m) => ["mint", m]);
        const encryptedContent = signer.encrypt(
          pubkey,
          JSON.stringify(mintTags)
        );

        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const relays = withBlastr(getDefaultRelays());
        const tags: string[][] = [["d", pubkey]];
        for (const relay of relays) {
          tags.push(["relay", relay]);
        }

        const eventTemplate: EventTemplate = {
          kind: 17375,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: encryptedContent,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            mints: params.mints,
            mintCount: params.mints.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set Cashu mints",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  server.tool(
    "send_cashu_payment",
    "Send a Cashu payment by melting tokens to pay a Lightning invoice. Uses proofs from your stored Cashu wallet.",
    {
      invoice: z.string().describe("Lightning invoice (bolt11) to pay"),
      mintUrl: z
        .string()
        .optional()
        .describe(
          "Cashu mint URL to use for melting (default: https://mint.minibits.cash/Bitcoin)"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { CashuMint, CashuWallet } = await import("@cashu/cashu-ts");
        const mintUrl = params.mintUrl || "https://mint.minibits.cash/Bitcoin";
        const mint = new CashuMint(mintUrl);
        const keys = await mint.getKeys();
        const wallet = new CashuWallet(mint, { keys: keys.keysets[0] as any });

        const { fetchCachedEvents } = await import("@/utils/db/db-service");
        const pubkey = signer.getPubKey();
        const proofEvents = await fetchCachedEvents(7375);
        const myProofEvents = proofEvents.filter(
          (e: any) => e.pubkey === pubkey
        );

        let availableProofs: any[] = [];
        for (const event of myProofEvents) {
          try {
            const decryptedContent = signer.decrypt(pubkey, event.content);
            const parsed = JSON.parse(decryptedContent);
            if (parsed.mint === mintUrl && parsed.proofs) {
              availableProofs.push(...parsed.proofs);
            }
          } catch {
            continue;
          }
        }

        if (availableProofs.length === 0) {
          return errorResponse(
            "No available proofs",
            `No Cashu proofs found for mint ${mintUrl}`,
            startTime
          );
        }

        const meltQuote = await wallet.createMeltQuote(params.invoice);
        const totalNeeded = meltQuote.amount + (meltQuote.fee_reserve || 0);
        const totalAvailable = availableProofs.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0
        );

        if (totalAvailable < totalNeeded) {
          return errorResponse(
            "Insufficient balance",
            `Need ${totalNeeded} sats but only have ${totalAvailable} sats`,
            startTime
          );
        }

        const meltResult = await wallet.meltProofs(meltQuote, availableProofs);

        return successResponse(
          {
            paid: meltResult.quote?.paid || true,
            amount: meltQuote.amount,
            fee: meltQuote.fee_reserve || 0,
            mintUrl,
            change: meltResult.change
              ? meltResult.change.reduce(
                  (sum: number, p: any) => sum + (p.amount || 0),
                  0
                )
              : 0,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to send Cashu payment",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );
}
