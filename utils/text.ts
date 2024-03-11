import keyword_extractor from "keyword-extractor";

export const REMOVE_URL_REGEX = /https?.*?(?= |$)/g;
export const getKeywords = (text: string) => {
  return keyword_extractor.extract(text.replace(REMOVE_URL_REGEX, ""), {
    language: "en",
    remove_digits: true,
    remove_duplicates: true,
    return_changed_case: true,
  });
};
