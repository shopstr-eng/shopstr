import type { NextApiRequest, NextApiResponse } from 'next';
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';

// post request
// parse vent content to get cost in stats
// pass value to wallet.requestMint()

const requestMint = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }
  
  try {
    const price = req.body.price;
    
    const wallet = new CashuWallet(new CashuMint("https://8333.space:3338"));

    const { pr, hash } = await wallet.requestMint(price);
  
    // async function invoiceHasBeenPaid() {
    //     const proofs = await wallet.requestTokens(2, hash);
    //   //Encoded proofs can be spent at the mint
    //     const encoded = getEncodedToken({
    //         token: [{ mint: 'https://8333.space:3338', proofs }]
    //     });
    //     console.log(encoded);
    // };
    
    return res.status(200).json({ pr, hash });
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default requestMint;
