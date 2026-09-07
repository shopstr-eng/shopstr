import { getHodlPolicy, holdTiming } from "../hodl-policy";
afterEach(() => {
  delete process.env.HODL_HOLD_CLTV_DELTA;
});
it("uses a finite explicit CLTV delta with a safety margin", () => {
  expect(getHodlPolicy().cltvDelta).toBe(80);
  process.env.HODL_HOLD_CLTV_DELTA = "3";
  expect(() => getHodlPolicy()).toThrow();
});
it("uses the earliest active HTLC expiry and last part acceptance time", () => {
  expect(
    holdTiming([
      { state: "ACCEPTED", expiry_height: 200, accept_time: "100" },
      { state: "ACCEPTED", expiry_height: 190, accept_time: "105" },
      { state: "CANCELED", expiry_height: 1, accept_time: "1" },
    ])
  ).toEqual({ holdExpiryHeight: 190, acceptedAt: 105 });
  expect(holdTiming([])).toEqual({});
});
