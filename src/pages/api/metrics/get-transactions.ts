import knex from 'knex';
import type { NextApiRequest, NextApiResponse } from 'next'

const getParamsFromURI = ( uri ) => {
  // Get everything after the `?`
  const [ , paramString ] = uri.split( '?' );

  // Return parameters
  console.log(paramString)
  
  return new URLSearchParams( paramString );
};

export default async function GetTransactions(req) {

  console.log('hiiii')
  console.log('dsfsdf', req)
  const params = getParamsFromURI(req.url);
  const startDate = params.get('startDate')
  console.log(params)
  const endDate = params.get('endDate')
    console.log(endDate)


  if (!startDate && !endDate) { 
  return res.status(400).json({ error: 'Missing startDate and/or endDate' })
  }
  

  const repo = await knex({
      client: 'pg',
      connection: {
        connectionString: process.env['DATABASE_URL'],
        ssl: { rejectUnauthorized: false, },
      },
      pool: {
        min: 2,
        max: 10
      },
    });
  
  const transactions = await repo.raw(`SELECT * FROM transactions WHERE time BETWEEN ${startDate} AND ${endDate}`)
 
  return res.status(200).json({ transactions })
}
