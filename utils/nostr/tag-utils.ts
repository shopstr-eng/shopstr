export function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

export function getAllTagValues(tags: string[][], key: string): string[] {
  return tags
    .filter((t) => t[0] === key)
    .map((t) => t[1]!)
    .filter(Boolean);
}

export function getDTag(tags: string[][]): string | undefined {
  return getTagValue(tags, "d");
}

export function hasTag(tags: string[][], key: string, value: string): boolean {
  return tags.some((tag) => tag[0] === key && tag[1] === value);
}
