export type FollowListsState = {
  directFollowList: string[];
  followList: string[];
  firstDegreeFollowsLength: number;
  isLoading: boolean;
};

type OptimisticFollowResult<T extends FollowListsState> = {
  state: T;
  shouldRefresh: true;
};

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

export function applyOptimisticFollow<T extends FollowListsState>(
  previous: T,
  targetPubkey: string
): OptimisticFollowResult<T> {
  const alreadyDirect = previous.directFollowList.includes(targetPubkey);

  return {
    state: {
      ...previous,
      directFollowList: appendUnique(previous.directFollowList, targetPubkey),
      followList: appendUnique(previous.followList, targetPubkey),
      firstDegreeFollowsLength: alreadyDirect
        ? previous.firstDegreeFollowsLength
        : previous.firstDegreeFollowsLength + 1,
      isLoading: true,
    },
    shouldRefresh: true,
  };
}

export function applyOptimisticUnfollow<T extends FollowListsState>(
  previous: T,
  targetPubkey: string
): OptimisticFollowResult<T> {
  const wasDirect = previous.directFollowList.includes(targetPubkey);

  return {
    state: {
      ...previous,
      directFollowList: previous.directFollowList.filter(
        (pubkey) => pubkey !== targetPubkey
      ),
      followList: previous.followList,
      firstDegreeFollowsLength: wasDirect
        ? Math.max(0, previous.firstDegreeFollowsLength - 1)
        : previous.firstDegreeFollowsLength,
      isLoading: true,
    },
    shouldRefresh: true,
  };
}

export function applyAuthoritativeFollowsRefresh<T extends FollowListsState>(
  previous: T,
  next: FollowListsState
): T {
  return {
    ...previous,
    ...next,
  };
}
