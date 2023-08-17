import type { NextApiRequest, NextApiResponse } from 'next';
import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';

const mintTokens = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const wallet = new CashuWallet(new CashuMint('https://8333.space:3338'));

    const { pr, hash } = await wallet.requestMint(200);
  
  //pay this LN invoice
    console.log({ pr }, { hash });
  
    async function invoiceHasBeenPaid() {
        const proofs = await wallet.requestTokens(200, hash);
      //Encoded proofs can be spent at the mint
        const encoded = getEncodedToken({
            token: [{ mint: 'https://8333.space:3338', proofs }]
        });
        console.log(encoded);
    };
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default mintTokens;
