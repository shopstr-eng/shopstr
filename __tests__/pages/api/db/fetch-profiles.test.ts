import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/db/fetch-profiles";
import { fetchAllProfilesFromDb } from "@/utils/db/db-service";

jest.mock("@/utils/db/db-service", () => ({
  fetchAllProfilesFromDb: jest.fn(),
}));
jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn(() => true),
}));

const fetchProfiles = jest.mocked(fetchAllProfilesFromDb);
const pubkey = "a".repeat(64);
const profile = {
  id: "profile",
  pubkey,
  created_at: 1,
  kind: 0,
  tags: [],
  content: "{}",
  sig: "signature",
};

function makeResponse() {
  const status = jest.fn();
  const json = jest.fn();
  const response = { status, json } as unknown as NextApiResponse;
  status.mockReturnValue(response);
  return { response, status, json };
}

async function requestProfiles(query: NextApiRequest["query"]) {
  const { response, status, json } = makeResponse();
  await handler({ method: "GET", query } as NextApiRequest, response);
  return { status, json };
}

beforeEach(() => {
  fetchProfiles.mockReset();
  fetchProfiles.mockResolvedValue([profile]);
});

it("keeps the unfiltered request available to existing callers", async () => {
  const { status, json } = await requestProfiles({});

  expect(fetchProfiles).toHaveBeenCalledWith();
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith([profile]);
});

it("passes the requested kind and deduplicated pubkeys to the database", async () => {
  const { status, json } = await requestProfiles({
    kind: "0",
    pubkeys: `${pubkey},${pubkey}`,
  });

  expect(fetchProfiles).toHaveBeenCalledWith({ kind: 0, pubkeys: [pubkey] });
  expect(status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith([profile]);
});

it.each([
  { kind: "0" },
  { pubkeys: pubkey },
  { kind: "1", pubkeys: pubkey },
  { kind: "0", pubkeys: "" },
  { kind: "0", pubkeys: [pubkey] },
  { kind: "30019", pubkeys: "not-a-pubkey" },
  { kind: "0", pubkeys: Array(101).fill(pubkey).join(",") },
])("rejects invalid scopes without querying all profiles", async (query) => {
  const { status } = await requestProfiles(query);

  expect(status).toHaveBeenCalledWith(400);
  expect(fetchProfiles).not.toHaveBeenCalled();
});
