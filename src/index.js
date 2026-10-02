// APP_ROLE is set per Elastic Beanstalk environment by CloudFormation.
// Importing a file starts it, so we import only the one we need.
if (process.env.APP_ROLE === 'worker') {
  await import('./worker.js');
} else {
  await import('./api.js');
}