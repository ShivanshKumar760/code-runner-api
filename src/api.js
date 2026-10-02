import express from 'express';
import {randomUUID} from 'node:crypto';
import config from './config.js';
import * as db from './db.js';
import * as queue from './queue.js';

async function main() {
    await db.ensureTableLocal();
    const channel = await queue.connect();
    const app = express();
    app.use(express.json({limit:'50kb'}));


    app.get('/health',(req,res)=>{
        res.send('ok');
    });

    app.post('/submissions',async (req,res)=>{
        const {language,code}=req.body || {};
        if(!config.languages[language]){
            const allowed = Object.keys(config.languages).join(', ');
            return res.status(400).json({ error: `language must be one of: ${allowed}` });
        }
        if (typeof code !== 'string' || !code.trim()){
            return res.status(400).json({ error: 'code must be a non-empty string' });
        }
        if (Buffer.byteLength(code) > config.limits.maxCodeBytes) {
            return res.status(413).json({ error: 'code too large' });
        }   

        const submissionId = randomUUID();
        await db.createSubmission({
            submissionId,
            language,
            code,
            status:'QUEUED',
            createdAt: new Date().toISOString(),
        });

        queue.publishJob(channel,{submissionId});
        res.status(202).json({ submissionId, status: 'QUEUED' });

    });


    app.get('/submissions/:id', async (req, res) => {
        const item = await db.getSubmission(req.params.id);
        if (!item) return res.status(404).json({ error: 'not found' });
        res.json(item);
    });

  app.listen(config.apiPort, () => console.log(`API listening on ${config.apiPort}`));
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});