import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';

const mintTokens = async (req: NextApiRequest, res: NextApiResponse) => {

};

export default 

const wallet = new CashuWallet(new CashuMint('{MINT_URL}'));

const { pr, hash } = await wallet.requestMint(200);

//pay this LN invoice
console.log({ pr }, { hash });

async function invoiceHasBeenPaid() {
    const proofs = await wallet.requestTokens(200, hash);
    //Encoded proofs can be spent at the mint
    const encoded = getEncodedToken({
        token: [{ mint: '{MINT_URL}', proofs }]
    });
    console.log(encoded);
}