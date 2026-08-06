import {
  buildNip58BadgeDefinitionFilters,
  fetchNip58ProfileBadges,
  isNip58ProfileBadgesEvent,
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
          ["a", badgeAddress],
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
        relayHint: "wss://badge.relay",
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
        deprecatedProfileBadgesEvent,
        standardProfileBadgesEvent,
      ])
    ).toBe(standardProfileBadgesEvent);
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

    expect(badgesByPubkey.get(profilePubkey)).toEqual([
      expect.objectContaining({
        definitionAddress: badgeAddress,
        awardEventId,
        name: "Medal of Bravery",
        image: "https://nostr.academy/awards/bravery.png",
      }),
    ]);
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
      ["wss://relay.example", "wss://badge.relay"],
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
      ["wss://relay.example", "wss://badge.relay"],
      expect.any(Number)
    );
  });
});
