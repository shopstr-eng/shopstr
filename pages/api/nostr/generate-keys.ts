import type { NextApiRequest, NextApiResponse } from 'next';
import { nip19, generatePrivateKey, getPublicKey } from 'nostr-tools';

const generateKeys = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({});
  }

  try {
    const sk = await generatePrivateKey(); // `sk` is a hex string
    const nsec = await nip19.nsecEncode(sk);
    
    const pk = await getPublicKey(sk); // `pk` is a hex string
    const npub = await nip19.npubEncode(pk);

    return res.status(200).json({ nsec, npub });
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default generateKeys;
