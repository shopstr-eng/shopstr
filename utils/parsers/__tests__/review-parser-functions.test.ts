import { getRatingValue, calculateWeightedScore } from '../review-parser-functions';

describe('getRatingValue', () => {
  const sampleTags: string[][] = [
    ['rating', '4.5', 'thumb'],
    ['rating', '5', 'shipping'],
    ['p', 'some_pubkey_here'],
    ['e', 'some_event_id_here'],
  ];

  it('should return the numeric value of an existing rating tag', () => {
    expect(getRatingValue(sampleTags, 'thumb')).toBe(4.5);
    expect(getRatingValue(sampleTags, 'shipping')).toBe(5);
  });

  it('should return 0 if the rating tag does not exist', () => {
    expect(getRatingValue(sampleTags, 'quality')).toBe(0);
  });

  it('should return 0 for an empty tags array', () => {
    expect(getRatingValue([], 'thumb')).toBe(0);
  });
});

describe('calculateWeightedScore', () => {
  it('should calculate the score correctly with only a thumb rating', () => {
    const tags: string[][] = [['rating', '4', 'thumb']];
    // Expected score: 4 * 0.5 = 2
    expect(calculateWeightedScore(tags)).toBe(2);
  });

  it('should calculate the score correctly with a thumb and one other rating', () => {
    const tags: string[][] = [
      ['rating', '4', 'thumb'],
      ['rating', '5', 'shipping'],
    ];
    // Expected score: (4 * 0.5) + (5 * 0.5) = 2 + 2.5 = 4.5
    expect(calculateWeightedScore(tags)).toBe(4.5);
  });

  it('should calculate the score correctly with a thumb and multiple other ratings', () => {
    const tags: string[][] = [
      ['rating', '4', 'thumb'],
      ['rating', '5', 'shipping'],
      ['rating', '3', 'quality'],
    ];
    // Individual weight for non-thumb ratings: 0.5 / 2 = 0.25
    // Expected score: (4 * 0.5) + (5 * 0.25) + (3 * 0.25) = 2 + 1.25 + 0.75 = 4
    expect(calculateWeightedScore(tags)).toBe(4);
  });

  it('should return 0 if there are no rating tags at all', () => {
    const tags: string[][] = [
      ['p', 'some_pubkey_here'],
      ['e', 'some_event_id_here'],
    ];
    expect(calculateWeightedScore(tags)).toBe(0);
  });

  it('should calculate score correctly with other ratings but no thumb rating', () => {
    const tags: string[][] = [
      ['rating', '5', 'shipping'],
      ['rating', '3', 'quality'],
    ];
    // Thumb score is 0. Individual weight: 0.5 / 2 = 0.25
    // Expected score: (0 * 0.5) + (5 * 0.25) + (3 * 0.25) = 0 + 1.25 + 0.75 = 2
    expect(calculateWeightedScore(tags)).toBe(2);
  });

  it('should handle floating point values precisely', () => {
    const tags: string[][] = [
      ['rating', '3.5', 'thumb'],
      ['rating', '4.2', 'quality'],
    ];
    // Expected score: (3.5 * 0.5) + (4.2 * 0.5) = 1.75 + 2.1 = 3.85
    expect(calculateWeightedScore(tags)).toBeCloseTo(3.85);
  });
});