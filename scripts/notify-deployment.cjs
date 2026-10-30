const path = require('path');

async function notifyDeployment(env = process.env) {
  const domain = env.DEPLOY_DOMAIN || 'embeddedindia.in';
  if (domain !== 'embeddedindia.in') throw new Error('Invalid deployment domain: only embeddedindia.in is supported.');
  // This script is streamed over SSH and runs from the installed application root.
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
  const mailer = require(path.join(process.cwd(), 'src/services/mailer'));
  const transport = await mailer.getTransporter();
  if (!transport || transport.isMock) throw new Error('Configure live SMTP in website Settings to send deployment confirmation.');
  const success = env.DEPLOY_STATUS === 'success';
  const result = await transport.sendMail({
    from: env.SMTP_FROM || transport.options?.auth?.user || env.SMTP_USER,
    to: 'sahil.kalka@gmail.com',
    subject: `[Embedded India] ${domain} deployment ${success ? 'verified' : env.DEPLOY_STATUS || 'failed'}`,
    text: [
      success ? 'Deployment completed and live checks passed.' : 'Deployment did not complete successfully. Review the workflow logs before treating this release as deployed.',
      `Site: https://${domain}`,
      `Commit: ${env.GITHUB_SHA || 'unknown'}`,
      `Workflow: https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    ].join('\n')
  });
  if (!result.accepted?.length || result.rejected?.length) throw new Error('Deployment email was not accepted by SMTP.');
  console.log('Deployment result email accepted by SMTP for sahil.kalka@gmail.com.');
}

module.exports = { notifyDeployment };
if (require.main === module || process.argv?.[1] === '-') notifyDeployment()
  .then(() => process.exit(0))
  .catch(error => { console.error(error.message); process.exit(1); });
