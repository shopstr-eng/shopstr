import {
  buildNip58BadgeDefinitionFilters,
  fetchNip58ProfileBadges,
  isNip58ProfileBadgesEvent,
  MAX_NIP58_PROFILE_BADGES,
  NIP58_BADGE_AWARD_KIND,
  NIP58_BADGE_DEFINITION_KIND,
  NIP58_BADGE_SET_KIND,
  NIP58_DEPRECATED_PROFILE_BADGES_D_TAG,
  NIP58_PROFILE_BADGES_KIND,
  parseNip58BadgeAddress,
  parseNip58BadgeDefinition,
  parseNip58ProfileBadgesEvent,
  resolveNip58ProfileBadgesForProfile,
  selectLatestNip58ProfileBadgesEvent,
} from "../badges";
import type { NostrManager } from "../nostr-manager";
import type { NostrEvent } from "@/utils/types/types";

const profilePubkey =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const issuerPubkey =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const otherIssuerPubkey =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const awardEventId =
  "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const otherAwardEventId =
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const badgeAddress = `${NIP58_BADGE_DEFINITION_KIND}:${issuerPubkey}:bravery`;
const otherBadgeAddress = `${NIP58_BADGE_DEFINITION_KIND}:${otherIssuerPubkey}:honor`;

const makeEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "1111111111111111111111111111111111111111111111111111111111111111",
  pubkey: issuerPubkey,
  created_at: 1,
  kind: 1,
  tags: [],
  content: "",
  sig: "sig",
  ...overrides,
});

describe("NIP-58 badge helpers", () => {
  it("parses badge definition addresses and keeps colons in d tags", () => {
    expect(parseNip58BadgeAddress(`${badgeAddress}:v2`)).toEqual({
      kind: NIP58_BADGE_DEFINITION_KIND,
      pubkey: issuerPubkey,
      d: "bravery:v2",
      address: `${NIP58_BADGE_DEFINITION_KIND}:${issuerPubkey}:bravery:v2`,
    });
    expect(parseNip58BadgeAddress("30008:bad:set")).toBeNull();
    expect(parseNip58BadgeAddress("30009:not-a-pubkey:badge")).toBeNull();
  });

  it("parses badge definition metadata and prefers compact thumbnails", () => {
    const definition = parseNip58BadgeDefinition(
      makeEvent({
        kind: NIP58_BADGE_DEFINITION_KIND,
        tags: [
          ["d", "bravery"],
          ["name", "Medal of Bravery"],
          ["description", "Awarded for demonstrating bravery"],
          ["image", "https://nostr.academy/awards/bravery.png", "1024x1024"],
          ["thumb", "https://nostr.academy/awards/bravery_256.png", "256x256"],
          ["thumb", "https://nostr.academy/awards/bravery_32.png", "32x32"],
        ],
      })
    );

    expect(definition).toMatchObject({
      definitionAddress: badgeAddress,
      issuerPubkey,
      badgeDefinitionDTag: "bravery",
      name: "Medal of Bravery",
      description: "Awarded for demonstrating bravery",
      image: "https://nostr.academy/awards/bravery.png",
      thumbnail: "https://nostr.academy/awards/bravery_32.png",
    });
  });

  it("parses only ordered consecutive profile badge a/e pairs", () => {
    const references = parseNip58ProfileBadgesEvent(
      makeEvent({
        kind: NIP58_PROFILE_BADGES_KIND,
        pubkey: profilePubkey,
        tags: [
          ["a", badgeAddress, "wss://definition.relay"],
          ["e", awardEventId, "wss://badge.relay"],
          ["e", otherAwardEventId],
          ["a", otherBadgeAddress],
          ["p", profilePubkey],
          ["a", `${NIP58_BADGE_SET_KIND}:${issuerPubkey}:set`],
          ["e", otherAwardEventId],
          ["a", badgeAddress],
          ["e", awardEventId],
        ],
      })
    );

    expect(references).toEqual([
      {
        definitionAddress: badgeAddress,
        awardEventId,
        definitionRelayHint: "wss://definition.relay",
        awardRelayHint: "wss://badge.relay",
      },
    ]);
  });

  it("treats deprecated 30008 profile_badges lists as profile badge events", () => {
    const deprecatedProfileBadgesEvent = makeEvent({
      kind: NIP58_BADGE_SET_KIND,
      tags: [
        ["d", NIP58_DEPRECATED_PROFILE_BADGES_D_TAG],
        ["a", badgeAddress],
        ["e", awardEventId],
      ],
    });
    const regularBadgeSetEvent = makeEvent({
      kind: NIP58_BADGE_SET_KIND,
      tags: [["d", "favorites"]],
    });
    const standardProfileBadgesEvent = makeEvent({
      id: "2222222222222222222222222222222222222222222222222222222222222222",
      kind: NIP58_PROFILE_BADGES_KIND,
      created_at: deprecatedProfileBadgesEvent.created_at,
    });

    expect(isNip58ProfileBadgesEvent(deprecatedProfileBadgesEvent)).toBe(true);
    expect(isNip58ProfileBadgesEvent(regularBadgeSetEvent)).toBe(false);
    expect(
      parseNip58ProfileBadgesEvent(deprecatedProfileBadgesEvent)
    ).toHaveLength(1);
    expect(
      selectLatestNip58ProfileBadgesEvent([
        standardProfileBadgesEvent,
        deprecatedProfileBadgesEvent,
      ])
    ).toBe(deprecatedProfileBadgesEvent);
  });

  it("uses the lowest event id for equal-timestamp badge definitions", () => {
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress],
        ["e", awardEventId],
      ],
    });
    const awardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress],
        ["p", profilePubkey],
      ],
    });
    const higherIdDefinition = makeEvent({
      id: "2222222222222222222222222222222222222222222222222222222222222222",
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Higher id"],
      ],
    });
    const lowerIdDefinition = makeEvent({
      id: "1111111111111111111111111111111111111111111111111111111111111111",
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Lower id"],
      ],
    });

    expect(
      resolveNip58ProfileBadgesForProfile({
        profilePubkey,
        profileBadgesEvent,
        awardEvents: [awardEvent],
        definitionEvents: [higherIdDefinition, lowerIdDefinition],
      })
    ).toEqual([expect.objectContaining({ name: "Lower id" })]);
  });

  it("builds definition filters grouped by issuer pubkey and d tag", () => {
    expect(
      buildNip58BadgeDefinitionFilters([
        badgeAddress,
        `${NIP58_BADGE_DEFINITION_KIND}:${issuerPubkey}:bravery`,
        otherBadgeAddress,
        "not-valid",
      ])
    ).toEqual([
      {
        kinds: [NIP58_BADGE_DEFINITION_KIND],
        authors: [issuerPubkey],
        "#d": ["bravery"],
      },
      {
        kinds: [NIP58_BADGE_DEFINITION_KIND],
        authors: [otherIssuerPubkey],
        "#d": ["honor"],
      },
    ]);
  });

  it("resolves profile badges only when award and definition events agree", () => {
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress],
        ["e", awardEventId],
        ["a", otherBadgeAddress],
        ["e", otherAwardEventId],
      ],
    });
    const validAwardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress],
        ["p", profilePubkey],
      ],
    });
    const wrongRecipientAwardEvent = makeEvent({
      id: otherAwardEventId,
      pubkey: otherIssuerPubkey,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", otherBadgeAddress],
        ["p", issuerPubkey],
      ],
    });
    const definitionEvent = makeEvent({
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Medal of Bravery"],
        ["thumb", "https://nostr.academy/awards/bravery_32.png", "32x32"],
      ],
    });
    const otherDefinitionEvent = makeEvent({
      pubkey: otherIssuerPubkey,
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "honor"],
        ["name", "Medal of Honor"],
      ],
    });

    expect(
      resolveNip58ProfileBadgesForProfile({
        profilePubkey,
        profileBadgesEvent,
        awardEvents: [validAwardEvent, wrongRecipientAwardEvent],
        definitionEvents: [definitionEvent, otherDefinitionEvent],
      })
    ).toEqual([
      {
        definitionAddress: badgeAddress,
        awardEventId,
        issuerPubkey,
        badgeDefinitionDTag: "bravery",
        name: "Medal of Bravery",
        image: undefined,
        thumbnail: "https://nostr.academy/awards/bravery_32.png",
        description: undefined,
      },
    ]);
  });

  it("fetches profile badge lists, awards, and definitions from relays", async () => {
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress],
        ["e", awardEventId, "wss://badge.relay"],
      ],
    });
    const awardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress],
        ["p", profilePubkey],
      ],
    });
    const definitionEvent = makeEvent({
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Medal of Bravery"],
        ["image", "https://nostr.academy/awards/bravery.png", "1024x1024"],
      ],
    });
    const nostr: Pick<NostrManager, "fetch"> = {
      fetch: jest.fn(),
    };
    const fetchMock = nostr.fetch as jest.MockedFunction<NostrManager["fetch"]>;
    fetchMock
      .mockResolvedValueOnce([profileBadgesEvent])
      .mockResolvedValueOnce([awardEvent])
      .mockResolvedValueOnce([definitionEvent]);

    const badgesByPubkey = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(badgesByPubkey.get(profilePubkey)).toEqual({
      badges: [
        expect.objectContaining({
          definitionAddress: badgeAddress,
          awardEventId,
          name: "Medal of Bravery",
          image: "https://nostr.academy/awards/bravery.png",
        }),
      ],
      complete: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      [
        {
          kinds: [NIP58_PROFILE_BADGES_KIND],
          authors: [profilePubkey],
        },
        {
          kinds: [NIP58_BADGE_SET_KIND],
          authors: [profilePubkey],
          "#d": [NIP58_DEPRECATED_PROFILE_BADGES_D_TAG],
        },
      ],
      {},
      ["wss://relay.example"],
      expect.any(Number)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      [
        {
          kinds: [NIP58_BADGE_AWARD_KIND],
          ids: [awardEventId],
        },
      ],
      {},
      ["wss://relay.example"],
      expect.any(Number)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      [
        {
          kinds: [NIP58_BADGE_DEFINITION_KIND],
          authors: [issuerPubkey],
          "#d": ["bravery"],
        },
      ],
      {},
      ["wss://relay.example"],
      expect.any(Number)
    );
  });

  it("distinguishes an explicit empty list from incomplete relay data", async () => {
    const emptyProfileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [],
    });
    const referencedProfileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: otherIssuerPubkey,
      tags: [
        ["a", badgeAddress],
        ["e", awardEventId],
      ],
    });
    const fetchMock = jest.fn();
    fetchMock
      .mockResolvedValueOnce([
        emptyProfileBadgesEvent,
        referencedProfileBadgesEvent,
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const nostr = { fetch: fetchMock };

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey, otherIssuerPubkey]
    );

    expect(result.get(profilePubkey)).toEqual({ badges: [], complete: true });
    expect(result.get(otherIssuerPubkey)).toEqual({
      badges: [],
      complete: false,
    });
  });

  it("expands a referenced kind 30008 Badge Set", async () => {
    const badgeSetAddress = `${NIP58_BADGE_SET_KIND}:${profilePubkey}:favorites`;
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [["a", badgeSetAddress]],
    });
    const badgeSetEvent = makeEvent({
      id: "abababababababababababababababababababababababababababababababab",
      kind: NIP58_BADGE_SET_KIND,
      pubkey: profilePubkey,
      tags: [
        ["d", "favorites"],
        ["a", badgeAddress],
        ["e", awardEventId],
      ],
    });
    const awardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress],
        ["p", profilePubkey],
      ],
    });
    const definitionEvent = makeEvent({
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Badge Set medal"],
      ],
    });
    const fetchMock = jest.fn(
      async (filters: Array<{ kinds?: number[]; "#d"?: string[] }>) => {
        if (
          filters.some((filter) =>
            filter.kinds?.includes(NIP58_PROFILE_BADGES_KIND)
          )
        ) {
          return [profileBadgesEvent];
        }
        if (
          filters.some(
            (filter) =>
              filter.kinds?.includes(NIP58_BADGE_SET_KIND) &&
              filter["#d"]?.includes("favorites")
          )
        ) {
          return [badgeSetEvent];
        }
        if (
          filters.some((filter) =>
            filter.kinds?.includes(NIP58_BADGE_AWARD_KIND)
          )
        ) {
          return [awardEvent];
        }
        if (
          filters.some((filter) =>
            filter.kinds?.includes(NIP58_BADGE_DEFINITION_KIND)
          )
        ) {
          return [definitionEvent];
        }
        return [];
      }
    );

    const result = await fetchNip58ProfileBadges(
      { fetch: fetchMock },
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(result.get(profilePubkey)).toEqual({
      badges: [
        expect.objectContaining({
          definitionAddress: badgeAddress,
          awardEventId,
          name: "Badge Set medal",
        }),
      ],
      complete: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      [
        {
          kinds: [NIP58_BADGE_SET_KIND],
          authors: [profilePubkey],
          "#d": ["favorites"],
        },
      ],
      {},
      ["wss://relay.example"],
      expect.any(Number)
    );
  });

  it("uses validated relay hints only for their associated references", async () => {
    const hintedProfileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress, "wss://definition.relay"],
        ["e", awardEventId, "wss://award.relay"],
        ["a", otherBadgeAddress, "https://not-a-websocket.example"],
        ["e", otherAwardEventId, "wss://user:secret@credentialed.relay"],
      ],
    });
    const awardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress, "wss://award-definition.relay"],
        ["p", profilePubkey],
      ],
    });
    const definitionEvent = makeEvent({
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Medal of Bravery"],
      ],
    });
    const fetchMock = jest.fn() as jest.MockedFunction<NostrManager["fetch"]>;
    fetchMock.mockImplementation(async (filters, _params, relayUrls) => {
      if (filters[0]?.kinds?.includes(NIP58_PROFILE_BADGES_KIND)) {
        return [hintedProfileBadgesEvent];
      }
      if (relayUrls?.[0] === "wss://award.relay") return [awardEvent];
      if (relayUrls?.[0] === "wss://definition.relay") {
        return [definitionEvent];
      }
      return [];
    });
    const transientFetchMock = jest.fn(
      async (
        filters: Parameters<NostrManager["fetch"]>[0],
        params: Parameters<NostrManager["fetch"]>[1],
        relayUrls: string[],
        timeout: number
      ) => ({
        events: await fetchMock(filters, params, relayUrls, timeout),
        complete: true,
      })
    );
    const nostr = {
      fetch: fetchMock,
      fetchTransientWithStatus: transientFetchMock,
    };

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(result.get(profilePubkey)).toEqual({
      badges: [expect.objectContaining({ awardEventId })],
      complete: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      [{ kinds: [NIP58_BADGE_AWARD_KIND], ids: [awardEventId] }],
      {},
      ["wss://award.relay"],
      expect.any(Number)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      [
        {
          kinds: [NIP58_BADGE_DEFINITION_KIND],
          authors: [issuerPubkey],
          "#d": ["bravery"],
        },
      ],
      {},
      ["wss://definition.relay"],
      expect.any(Number)
    );
    const contactedRelays = fetchMock.mock.calls.flatMap(
      (call) => call[2] || []
    );
    expect(contactedRelays).not.toContain("https://not-a-websocket.example");
    expect(contactedRelays).not.toContain(
      "wss://user:secret@credentialed.relay"
    );
    expect(transientFetchMock).toHaveBeenCalledWith(
      [{ kinds: [NIP58_BADGE_AWARD_KIND], ids: [awardEventId] }],
      {},
      ["wss://award.relay"],
      expect.any(Number)
    );
    expect(transientFetchMock).toHaveBeenCalledWith(
      [
        {
          kinds: [NIP58_BADGE_DEFINITION_KIND],
          authors: [issuerPubkey],
          "#d": ["bravery"],
        },
      ],
      {},
      ["wss://definition.relay"],
      expect.any(Number)
    );
  });

  it("caps badge references and untrusted hinted relays before fetching", async () => {
    const tags: string[][] = [];
    for (let index = 0; index < MAX_NIP58_PROFILE_BADGES + 2; index += 1) {
      const id = index.toString(16).padStart(64, "0");
      tags.push(
        ["a", `${badgeAddress}:${index}`, `wss://definition-${index}.relay`],
        ["e", id, `wss://award-${index}.relay`]
      );
    }
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags,
    });
    const nostr: Pick<NostrManager, "fetch"> = { fetch: jest.fn() };
    const fetchMock = nostr.fetch as jest.MockedFunction<NostrManager["fetch"]>;
    fetchMock.mockResolvedValueOnce([profileBadgesEvent]).mockResolvedValue([]);

    await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    const awardIds = fetchMock.mock.calls
      .flatMap((call) => call[0])
      .filter((filter) => filter.kinds?.includes(NIP58_BADGE_AWARD_KIND))
      .flatMap((filter) => filter.ids || []);
    expect(new Set(awardIds).size).toBe(MAX_NIP58_PROFILE_BADGES);

    const hintedRelays = new Set(
      fetchMock.mock.calls
        .flatMap((call) => call[2] || [])
        .filter((relay) => relay !== "wss://relay.example")
    );
    expect(hintedRelays.size).toBeLessThanOrEqual(8);
  });

  it("does not follow definition hints from an invalid award", async () => {
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress],
        ["e", awardEventId],
      ],
    });
    const invalidAwardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress, "wss://do-not-contact.relay"],
        ["p", otherIssuerPubkey],
      ],
    });
    const nostr: Pick<NostrManager, "fetch"> = { fetch: jest.fn() };
    const fetchMock = nostr.fetch as jest.MockedFunction<NostrManager["fetch"]>;
    fetchMock
      .mockResolvedValueOnce([profileBadgesEvent])
      .mockResolvedValueOnce([invalidAwardEvent])
      .mockResolvedValue([]);

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(result.get(profilePubkey)).toEqual({ badges: [], complete: true });
    expect(fetchMock.mock.calls.flatMap((call) => call[2] || [])).not.toContain(
      "wss://do-not-contact.relay"
    );
  });

  it("distinguishes retryable timeouts from a conclusive absent list", async () => {
    const emptyProfileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [],
    });
    const nostr = {
      fetch: jest.fn(),
      fetchWithStatus: jest.fn().mockResolvedValue({
        events: [emptyProfileBadgesEvent],
        complete: false,
      }),
    };

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(result.get(profilePubkey)).toEqual({ badges: [], complete: false });

    nostr.fetchWithStatus.mockResolvedValue({ events: [], complete: true });
    const absentResult = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );
    expect(absentResult.get(profilePubkey)).toEqual({
      badges: [],
      complete: false,
      retryable: false,
    });
  });

  it("queries a definition hint even when configured relays returned an older definition", async () => {
    const profileBadgesEvent = makeEvent({
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress, "wss://definition.relay"],
        ["e", awardEventId],
      ],
    });
    const awardEvent = makeEvent({
      id: awardEventId,
      kind: NIP58_BADGE_AWARD_KIND,
      tags: [
        ["a", badgeAddress],
        ["p", profilePubkey],
      ],
    });
    const olderDefinitionEvent = makeEvent({
      id: "1111111111111111111111111111111111111111111111111111111111111111",
      created_at: 10,
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Older definition"],
      ],
    });
    const newerDefinitionEvent = makeEvent({
      id: "2222222222222222222222222222222222222222222222222222222222222222",
      created_at: 20,
      kind: NIP58_BADGE_DEFINITION_KIND,
      tags: [
        ["d", "bravery"],
        ["name", "Newer hinted definition"],
      ],
    });
    const nostr: Pick<NostrManager, "fetch"> = { fetch: jest.fn() };
    const fetchMock = nostr.fetch as jest.MockedFunction<NostrManager["fetch"]>;
    fetchMock.mockImplementation(async (filters, _params, relayUrls) => {
      if (filters[0]?.kinds?.includes(NIP58_PROFILE_BADGES_KIND)) {
        return [profileBadgesEvent];
      }
      if (filters[0]?.kinds?.includes(NIP58_BADGE_AWARD_KIND)) {
        return [awardEvent];
      }
      if (filters[0]?.kinds?.includes(NIP58_BADGE_DEFINITION_KIND)) {
        return relayUrls?.[0] === "wss://definition.relay"
          ? [newerDefinitionEvent]
          : [olderDefinitionEvent];
      }
      return [];
    });

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey]
    );

    expect(result.get(profilePubkey)).toEqual({
      badges: [expect.objectContaining({ name: "Newer hinted definition" })],
      complete: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      [
        {
          kinds: [NIP58_BADGE_DEFINITION_KIND],
          authors: [issuerPubkey],
          "#d": ["bravery"],
        },
      ],
      {},
      ["wss://definition.relay"],
      expect.any(Number)
    );
  });

  it("keeps completion scoped to the profile whose definition hint timed out", async () => {
    const secondProfilePubkey =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const firstProfileList = makeEvent({
      id: "1010101010101010101010101010101010101010101010101010101010101010",
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: profilePubkey,
      tags: [
        ["a", badgeAddress, "wss://slow-definition.relay"],
        ["e", awardEventId],
      ],
    });
    const secondProfileList = makeEvent({
      id: "2020202020202020202020202020202020202020202020202020202020202020",
      kind: NIP58_PROFILE_BADGES_KIND,
      pubkey: secondProfilePubkey,
      tags: [
        ["a", otherBadgeAddress],
        ["e", otherAwardEventId],
      ],
    });
    const awards = [
      makeEvent({
        id: awardEventId,
        kind: NIP58_BADGE_AWARD_KIND,
        pubkey: issuerPubkey,
        tags: [
          ["a", badgeAddress],
          ["p", profilePubkey],
        ],
      }),
      makeEvent({
        id: otherAwardEventId,
        kind: NIP58_BADGE_AWARD_KIND,
        pubkey: otherIssuerPubkey,
        tags: [
          ["a", otherBadgeAddress],
          ["p", secondProfilePubkey],
        ],
      }),
    ];
    const secondDefinition = makeEvent({
      id: "3030303030303030303030303030303030303030303030303030303030303030",
      kind: NIP58_BADGE_DEFINITION_KIND,
      pubkey: otherIssuerPubkey,
      tags: [
        ["d", "honor"],
        ["name", "Resolved badge"],
      ],
    });
    const nostr = {
      fetch: jest.fn(),
      fetchWithStatus: jest
        .fn()
        .mockImplementation((filters, _params, relays) => {
          if (filters[0]?.kinds?.includes(NIP58_PROFILE_BADGES_KIND)) {
            return Promise.resolve({
              events: [firstProfileList, secondProfileList],
              complete: true,
            });
          }
          if (filters[0]?.kinds?.includes(NIP58_BADGE_AWARD_KIND)) {
            return Promise.resolve({ events: awards, complete: true });
          }
          if (relays?.[0] === "wss://slow-definition.relay") {
            return Promise.resolve({ events: [], complete: false });
          }
          return Promise.resolve({
            events: [secondDefinition],
            complete: true,
          });
        }),
    };

    const result = await fetchNip58ProfileBadges(
      nostr,
      ["wss://relay.example"],
      [profilePubkey, secondProfilePubkey]
    );

    expect(result.get(profilePubkey)?.complete).toBe(false);
    expect(result.get(secondProfilePubkey)).toEqual({
      badges: [expect.objectContaining({ name: "Resolved badge" })],
      complete: true,
    });
  });

  it("stops parsing after the requested number of usable references", () => {
    const tags = [
      ["a", badgeAddress],
      ["e", awardEventId],
      ["a", otherBadgeAddress],
      ["e", otherAwardEventId],
    ];

    expect(
      parseNip58ProfileBadgesEvent(
        makeEvent({
          kind: NIP58_PROFILE_BADGES_KIND,
          pubkey: profilePubkey,
          tags,
        }),
        1
      )
    ).toHaveLength(1);
  });
});
