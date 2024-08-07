export const shortenString = (val: string, onStart?: number, onEnd?: number) => {
    const fromStart = onStart ?? 4;
    const fromEnd = onEnd ?? fromStart;
    if (!val) return null;

    const strLen = val.length;
    const beginningString = val.substring(0, fromStart);
    const endString = val.substring(strLen - fromEnd, strLen);

    return `${beginningString}....${endString}`;
}