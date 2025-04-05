export const getRatingValue = (tags: string[][], type: string): number => {
  const ratingTag = tags.find((tag) => tag[0] === "rating" && tag[2] === type);
  return ratingTag ? parseFloat(ratingTag[1]!) : 0;
};

export const calculateWeightedScore = (tags: string[][]): number => {
  // Thumb score is always 50% of total
  const thumbScore = getRatingValue(tags, "thumb") * 0.5;

  // Get all rating tags except thumb
  const ratingTags = tags
    .filter((tag) => tag[0] === "rating" && tag[2] !== "thumb")
    .map((tag) => tag[2]);

  // If no additional ratings, return just thumb score
  if (ratingTags.length === 0) return thumbScore;

  // Calculate weight for each remaining rating (dividing remaining 50% equally)
  const individualWeight = 0.5 / ratingTags.length;

  // Calculate score for remaining ratings
  const remainingScore = ratingTags.reduce((total, ratingType) => {
    return total + getRatingValue(tags, ratingType!) * individualWeight;
  }, 0);

  return thumbScore + remainingScore;
};
