// import ampq from 'amqplib';
// import config from './config.js';


// function buildUrl(){
//     const url = new URL(config.rabbit.endpoint);
//     url.username = config.rabbit.username;
//     url.password = config.rabbit.password;
//     return url.toString();
// }


// export async function connect(retries = 10) {
//     for(let attempt=1; ; attempt++){
//         try {
//             const connection = await ampq.connect(buildUrl());
//             connection.on('close',()=>{
//                 console.error('RabbitMQ connection closed');
//                 process.exit(1);
//             });

//             connection.on('error',(e)=>console.error('RabbitMQ error',e.message));
//             const channel = await connection.createChannel();
//             await channel.assertQueue(config.queueName,{durable:true});
//             return channel;
//         }catch(err){
//             if(attempt>=retries) throw err;
//             console.log(`RabbitMQ not ready (attempt ${attempt}): ${err.message}`);
//             await new Promise((resolve)=>setTimeout(resolve,3000));
//         }
//     }
// }

// export function publishJob(channel,job){
//     // channel.sendToQueue(config.queueName,Buffer.from(JSON.stringify(job)),{persistent:true});
//       channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(job)), { persistent: true });

// }


import amqp from 'amqplib';
import config from './config.js';

// Builds amqps://user:pass@host:5671 from separate settings.
function buildUrl() {
  const url = new URL(config.rabbit.endpoint);
  url.username = config.rabbit.user; // config.js calls this field "user", not "username"
  url.password = config.rabbit.password; // the URL class escapes special characters
  return url.toString();
}

export async function connect(retries = 10) {
  for (let attempt = 1; ; attempt++) {
    try {
      const connection = await amqp.connect(buildUrl());
      // If RabbitMQ drops us, crash on purpose: Beanstalk restarts the process.
      connection.on('close', () => {
        console.error('RabbitMQ connection closed');
        process.exit(1);
      });
      connection.on('error', (e) => console.error('RabbitMQ error', e.message));
      const channel = await connection.createChannel();
      // durable queue = survives a broker restart
      await channel.assertQueue(config.queueName, { durable: true });
      return channel;
    } catch (err) {
      if (attempt >= retries) throw err;
      console.log(`RabbitMQ not ready (attempt ${attempt}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function publishJob(channel, job) {
  // persistent = RabbitMQ writes the message to disk
  channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(job)), { persistent: true });
}