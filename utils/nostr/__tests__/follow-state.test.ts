import {
  applyAuthoritativeFollowsRefresh,
  applyOptimisticFollow,
  applyOptimisticUnfollow,
} from "../follow-state";

describe("follow state helpers", () => {
  const targetPubkey = "a".repeat(64);
  const otherDirectPubkey = "b".repeat(64);
  const secondDegreePubkey = "c".repeat(64);

  const baseState = {
    directFollowList: [targetPubkey, otherDirectPubkey],
    followList: [targetPubkey, otherDirectPubkey, secondDegreePubkey],
    firstDegreeFollowsLength: 2,
    isLoading: false,
  };

  it("removes only the direct follow optimistically until WoT is recomputed", () => {
    const result = applyOptimisticUnfollow(baseState, targetPubkey);

    expect(result.shouldRefresh).toBe(true);
    expect(result.state.directFollowList).toEqual([otherDirectPubkey]);
    expect(result.state.followList).toEqual(baseState.followList);
    expect(result.state.firstDegreeFollowsLength).toBe(1);
    expect(result.state.isLoading).toBe(true);
  });

  it("can restore an unfollowed merchant when refresh says it still qualifies through WoT", () => {
    const optimistic = applyOptimisticUnfollow(baseState, targetPubkey).state;

    const refreshed = applyAuthoritativeFollowsRefresh(optimistic, {
      directFollowList: [otherDirectPubkey],
      followList: [otherDirectPubkey, targetPubkey, secondDegreePubkey],
      firstDegreeFollowsLength: 1,
      isLoading: false,
    });

    expect(refreshed.directFollowList).toEqual([otherDirectPubkey]);
    expect(refreshed.followList).toContain(targetPubkey);
    expect(refreshed.isLoading).toBe(false);
  });

  it("optimistically adds direct follows and also requests authoritative refresh", () => {
    const newPubkey = "d".repeat(64);

    const result = applyOptimisticFollow(baseState, newPubkey);

    expect(result.shouldRefresh).toBe(true);
    expect(result.state.directFollowList).toContain(newPubkey);
    expect(result.state.followList).toContain(newPubkey);
    expect(result.state.firstDegreeFollowsLength).toBe(3);
    expect(result.state.isLoading).toBe(true);
  });
});
