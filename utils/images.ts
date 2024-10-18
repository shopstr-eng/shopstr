const hostToSrcSet = (url: URL) => {
  const host = url.host;

  // add all known image hosting providers here and configure responsive src formatting
  switch (host) {
    case "image.nostr.build":
      return ["240", "480", "720", "1080"]
        .map((size) => `${url.origin}/resp/${size}p${url.pathname} ${size}w`)
        .join(", ");
    case "i.nostr.build":
      return ["240", "480", "720", "1080"]
        .map((size) => `${url.origin}/resp/${size}p${url.pathname} ${size}w`)
        .join(", ");
    default:
      return url.toString();
  }
};

export const buildSrcSet = (image: string) => {
  try {
    const url = new URL(image);
    return hostToSrcSet(url);
  } catch (err) {
    console.log(err);
    return image;
  }
};
