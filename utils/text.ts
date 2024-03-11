import keyword_extractor from "keyword-extractor";

export const REMOVE_URL_REGEX =
  /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;

export const getKeywords = (text: string) => {
  return keyword_extractor.extract(text.replace(REMOVE_URL_REGEX, ""), {
    language: "en",
    remove_digits: true,
    remove_duplicates: true,
    return_changed_case: true,
  });
};
