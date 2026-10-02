// One place for settings. Add a language by adding one entry to "languages".
const config = {
  // On Beanstalk, PORT is set to 8080. Locally: API = 3000, worker health server = 3001.
  apiPort: Number(process.env.PORT || 3000),
  workerPort: Number(process.env.PORT || 3001),

  region: process.env.AWS_REGION || 'ap-south-1',
  tableName: process.env.DYNAMODB_TABLE || 'code-runner-submissions',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined, // set only locally

  queueName: process.env.QUEUE_NAME || 'code-jobs',
  rabbit: {
    endpoint: process.env.RABBITMQ_ENDPOINT || 'amqp://localhost:5672',
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
  },

  limits: {
    maxCodeBytes: 10000,            // reject bigger submissions
    timeoutMs: 5000,                // kill the container after 5 seconds
    memoryBytes: 128 * 1024 * 1024,
    cpus: 0.5,
    maxProcesses: 64,               // stops fork bombs
    maxOutputChars: 10000,
  },

  // language -> docker image + how to hand the code to the interpreter
  languages: {
    javascript: { image: 'node:24-alpine', cmd: (code) => ['node', '-e', code] },
    python: { image: 'python:3.13-alpine', cmd: (code) => ['python', '-c', code] },
  },
};

export default config;